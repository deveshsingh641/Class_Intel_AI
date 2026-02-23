// @ts-nocheck
/// <reference lib="dom" />
/**
 * ═══════════════════════════════════════════════════════════════
 *  Simplifii ERP Scraper — ABES Engineering College
 *  page.evaluate() callbacks run in browser context so TS cannot
 *  type-check DOM references like document, NodeList, etc.
 * ═══════════════════════════════════════════════════════════════
 */

import puppeteer, { type Page, type Browser } from "puppeteer";

const BASE_URL = "https://abes.web.simplifii.com";
const LOGIN_URL = `${BASE_URL}/index.php`;
const DASHBOARD_URL = `${BASE_URL}/dashboard.php`;

// ── Types ─────────────────────────────────────────────────────

export interface SimplifiiCredentials {
  username: string; // enrollment number or email
  password: string;
}

export interface AttendanceRecord {
  subject: string;
  teacherName: string;
  totalClasses: number;
  attended: number;
  percentage: number;
  status: string; // "Short" | "Ok" | "Detained"
}

export interface LectureRecord {
  date: string;
  day: string;
  subject: string;
  teacherName: string;
  time: string;
  status: string; // "P" | "A"
  lectureType: string; // "Lecture" | "Lab" | "Tutorial"
}

export interface TeacherRecord {
  name: string;
  subject: string;
  department: string;
}

export interface ScrapedData {
  studentName: string;
  enrollmentNo: string;
  branch: string;
  semester: string;
  attendance: AttendanceRecord[];
  lectures: LectureRecord[];
  teachers: TeacherRecord[];
  scrapedAt: Date;
}

// ── Helper: wait safely ───────────────────────────────────────

async function safeWait(page: Page, ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// ── Main Scraper ──────────────────────────────────────────────

export async function scrapeSimplifii(
  credentials: SimplifiiCredentials,
  onProgress?: (msg: string) => void
): Promise<ScrapedData> {
  const log = onProgress || console.log;
  let browser: Browser | null = null;

  try {
    log("🚀 Launching browser...");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // ── Step 1: Login ───────────────────────────────────────
    log("🔐 Logging into Simplifii portal...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await safeWait(page, 1000);

    // Find and fill login form
    // Simplifii typically uses input fields for email/enrollment and password
    const emailSelector = 'input[type="text"], input[type="email"], input[name="username"], input[name="email"], input[placeholder*="mail"], input[placeholder*="nroll"], input[placeholder*="ser"]';
    const passwordSelector = 'input[type="password"]';
    const submitSelector = 'button[type="submit"], input[type="submit"], button.btn-primary, .login-btn, button:has-text("Login"), button:has-text("Sign")';

    await page.waitForSelector(emailSelector, { timeout: 10000 });

    // Clear and type credentials
    const emailInput = await page.$(emailSelector);
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(credentials.username, { delay: 50 });
    }

    const passInput = await page.$(passwordSelector);
    if (passInput) {
      await passInput.click({ clickCount: 3 });
      await passInput.type(credentials.password, { delay: 50 });
    }

    // Click submit
    await safeWait(page, 500);
    const submitBtn = await page.$(submitSelector);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      // Fallback: press Enter
      await page.keyboard.press("Enter");
    }

    // Wait for navigation after login
    await safeWait(page, 3000);

    // Check if login was successful
    const currentUrl = page.url();
    if (currentUrl.includes("index.php") || currentUrl.includes("login")) {
      // Check for error message
      const errorMsg = await page.evaluate(() => {
        const el = document.querySelector(".alert-danger, .error, .text-danger, .notify");
        return el?.textContent?.trim() || null;
      });
      throw new Error(errorMsg || "Login failed. Check your credentials.");
    }

    log("✅ Login successful!");

    // ── Step 2: Get student info ────────────────────────────
    log("📋 Extracting student profile...");
    const studentInfo = await page.evaluate(() => {
      const getText = (sel: string) => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || "";
      };

      // Try to find student name and info from the dashboard
      const allText = document.body.innerText;
      let name = "";
      let enrollment = "";
      let branch = "";
      let semester = "";

      // Look for common patterns in Simplifii dashboard
      const nameEl = document.querySelector(".student-name, .user-name, .profile-name, h3, h4");
      if (nameEl) name = nameEl.textContent?.trim() || "";

      // Try to extract from profile section or header
      const profileDetails = document.querySelectorAll("td, span, p, div");
      profileDetails.forEach((el) => {
        const text = el.textContent?.trim() || "";
        if (/^\d{10,12}$/.test(text)) enrollment = text;
        if (/B\.\s*Tech|CSE|IT|ECE|ME|CE|EE/i.test(text) && text.length < 50) branch = text;
        if (/semester|sem/i.test(text) && text.length < 30) semester = text;
      });

      return { name, enrollment, branch, semester };
    });

    // ── Step 3: Scrape attendance summary ───────────────────
    log("📊 Scraping attendance data...");

    // Navigate to attendance tab — Simplifii uses tab_id parameter
    // tab_id=2 is typically attendance for students
    await page.goto(
      `${DASHBOARD_URL}?tab_id=2&config=student&h_tab_id=1&page=1`,
      { waitUntil: "networkidle2", timeout: 30000 }
    );
    await safeWait(page, 2000);

    const attendance = await page.evaluate(() => {
      const records: any[] = [];
      // Simplifii renders data in HTML tables
      const tables = document.querySelectorAll("table");

      for (const table of tables) {
        const rows = table.querySelectorAll("tbody tr, tr");
        const headers: string[] = [];

        // Get headers
        const headerRow = table.querySelector("thead tr, tr:first-child");
        if (headerRow) {
          headerRow.querySelectorAll("th, td").forEach((th) => {
            headers.push(th.textContent?.trim()?.toLowerCase() || "");
          });
        }

        // Skip header row, parse data rows
        const dataRows = table.querySelectorAll("tbody tr");
        const rowsToProcess = dataRows.length > 0 ? dataRows : Array.from(rows).slice(1);

        for (const row of rowsToProcess) {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => td.textContent?.trim() || ""
          );
          if (cells.length < 3) continue;

          // Try to identify columns by header or position
          // Common Simplifii attendance format:
          // S.No | Subject | Teacher | Total | Present | % | Status
          const record: any = {};

          // Smart column detection
          for (let i = 0; i < cells.length; i++) {
            const h = headers[i] || "";
            const val = cells[i];

            if (h.includes("subject") || h.includes("course") || (i === 1 && !record.subject)) {
              record.subject = val;
            } else if (h.includes("teacher") || h.includes("faculty") || h.includes("name")) {
              record.teacherName = val;
            } else if (h.includes("total") || h.includes("class")) {
              record.totalClasses = parseInt(val) || 0;
            } else if (h.includes("present") || h.includes("attend")) {
              record.attended = parseInt(val) || 0;
            } else if (h.includes("percent") || h.includes("%") || val.includes("%")) {
              record.percentage = parseFloat(val.replace("%", "")) || 0;
            } else if (h.includes("status") || h.includes("remark")) {
              record.status = val;
            }
          }

          // Fallback: positional parsing if headers didn't work
          if (!record.subject && cells.length >= 4) {
            // Common format: [SNo, Subject, Total, Present, %, Status]
            const startIdx = /^\d+$/.test(cells[0]) ? 1 : 0; // skip S.No
            record.subject = cells[startIdx] || "";
            record.teacherName = cells[startIdx + 1] || "";

            // Find numeric values for totals and attendance
            const nums = cells.slice(startIdx).filter((c) => /^\d+$/.test(c));
            if (nums.length >= 2) {
              record.totalClasses = parseInt(nums[0]) || 0;
              record.attended = parseInt(nums[1]) || 0;
            }

            // Find percentage
            const pctCell = cells.find((c) => c.includes("%") || /^\d{1,3}\.\d+$/.test(c));
            if (pctCell) {
              record.percentage = parseFloat(pctCell.replace("%", "")) || 0;
            } else if (record.totalClasses > 0) {
              record.percentage = Math.round((record.attended / record.totalClasses) * 100 * 100) / 100;
            }

            record.status = cells[cells.length - 1] || "";
          }

          if (record.subject && record.subject.length > 1 && !/^s\.?\s?no|#/i.test(record.subject)) {
            records.push(record);
          }
        }
      }

      return records;
    });

    log(`  📊 Found ${attendance.length} subject attendance records`);

    // ── Step 4: Scrape detailed lecture-wise attendance ──────
    log("📚 Scraping lecture-wise details...");

    const lectures: LectureRecord[] = [];

    // Try different tab patterns for lecture details
    // Simplifii often has detailed/date-wise attendance at a different tab
    const detailTabUrls = [
      `${DASHBOARD_URL}?tab_id=2&config=student&h_tab_id=2&page=1`,
      `${DASHBOARD_URL}?tab_id=2&config=student&h_tab_id=3&page=1`,
      `${DASHBOARD_URL}?tab_id=3&config=student&h_tab_id=1&page=1`,
    ];

    for (const tabUrl of detailTabUrls) {
      try {
        await page.goto(tabUrl, { waitUntil: "networkidle2", timeout: 15000 });
        await safeWait(page, 2000);

        const pageLectures = await page.evaluate(() => {
          const records: any[] = [];
          const tables = document.querySelectorAll("table");

          for (const table of tables) {
            const rows = table.querySelectorAll("tbody tr");
            if (rows.length === 0) continue;

            // Get headers
            const headers: string[] = [];
            const headerRow = table.querySelector("thead tr");
            if (headerRow) {
              headerRow.querySelectorAll("th").forEach((th) => {
                headers.push(th.textContent?.trim()?.toLowerCase() || "");
              });
            }

            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll("td")).map(
                (td) => td.textContent?.trim() || ""
              );
              if (cells.length < 3) continue;

              const record: any = {};

              for (let i = 0; i < cells.length; i++) {
                const h = headers[i] || "";
                const val = cells[i];

                if (h.includes("date")) record.date = val;
                else if (h.includes("day")) record.day = val;
                else if (h.includes("subject") || h.includes("course")) record.subject = val;
                else if (h.includes("teacher") || h.includes("faculty")) record.teacherName = val;
                else if (h.includes("time") || h.includes("slot")) record.time = val;
                else if (h.includes("status") || h.includes("attend")) record.status = val;
                else if (h.includes("type") || h.includes("lecture")) record.lectureType = val;
              }

              // Fallback positional
              if (!record.date && cells.length >= 3) {
                // Try to find date-like values
                for (const cell of cells) {
                  if (/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(cell) || /\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(cell)) {
                    record.date = cell;
                    break;
                  }
                }
                // Find P/A status
                for (const cell of cells) {
                  if (/^[PA]$/i.test(cell) || /present|absent/i.test(cell)) {
                    record.status = cell.charAt(0).toUpperCase();
                    break;
                  }
                }
              }

              if (record.date || record.subject) {
                record.status = record.status || "P";
                record.lectureType = record.lectureType || "Lecture";
                records.push(record);
              }
            }
          }
          return records;
        });

        lectures.push(...pageLectures);

        // Check for pagination and scrape more pages
        const hasNextPage = await page.evaluate(() => {
          const nextBtn = document.querySelector('a[rel="next"], .pagination .next:not(.disabled), a:has-text("Next"), a:has-text("»")');
          return !!nextBtn;
        });

        if (hasNextPage) {
          // Scrape up to 5 additional pages
          for (let pg = 2; pg <= 6; pg++) {
            try {
              const pageUrl = tabUrl.replace("page=1", `page=${pg}`);
              await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 10000 });
              await safeWait(page, 1500);

              const moreLectures = await page.evaluate(() => {
                const records: any[] = [];
                const tables = document.querySelectorAll("table");
                for (const table of tables) {
                  const rows = table.querySelectorAll("tbody tr");
                  for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll("td")).map(
                      (td) => td.textContent?.trim() || ""
                    );
                    if (cells.length < 3) continue;
                    const record: any = {};
                    for (const cell of cells) {
                      if (/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(cell)) record.date = cell;
                      else if (/^[PA]$/i.test(cell)) record.status = cell;
                      else if (cell.length > 3 && !record.subject) record.subject = cell;
                      else if (cell.length > 3 && !record.teacherName) record.teacherName = cell;
                    }
                    if (record.date || record.subject) records.push(record);
                  }
                }
                return records;
              });

              lectures.push(...moreLectures);

              // Check if there's still a next page
              const morePages = await page.evaluate(() => {
                const rows = document.querySelectorAll("tbody tr");
                return rows.length > 0;
              });
              if (!morePages) break;
            } catch {
              break;
            }
          }
        }

        if (lectures.length > 0) break; // Found data, stop trying other tabs
      } catch {
        continue; // Try next tab URL
      }
    }

    log(`  📚 Found ${lectures.length} lecture records`);

    // ── Step 5: Extract unique teachers ─────────────────────
    log("👨‍🏫 Extracting teacher list...");

    const teacherMap = new Map<string, TeacherRecord>();

    // From attendance records
    attendance.forEach((a: any) => {
      if (a.teacherName && a.teacherName.length > 2) {
        teacherMap.set(a.teacherName, {
          name: a.teacherName,
          subject: a.subject || "",
          department: studentInfo.branch || "CSE",
        });
      }
    });

    // From lecture records
    lectures.forEach((l) => {
      if (l.teacherName && l.teacherName.length > 2) {
        if (!teacherMap.has(l.teacherName)) {
          teacherMap.set(l.teacherName, {
            name: l.teacherName,
            subject: l.subject || "",
            department: studentInfo.branch || "CSE",
          });
        }
      }
    });

    // Also try to get teacher list from a different tab
    try {
      // Some Simplifii portals have a faculty/teacher tab
      const facultyUrls = [
        `${DASHBOARD_URL}?tab_id=4&config=student&h_tab_id=1`,
        `${DASHBOARD_URL}?tab_id=5&config=student&h_tab_id=1`,
        `${DASHBOARD_URL}?tab_id=1&config=student&h_tab_id=2`,
      ];

      for (const url of facultyUrls) {
        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 10000 });
          await safeWait(page, 1500);

          const pageTeachers = await page.evaluate(() => {
            const records: any[] = [];
            const tables = document.querySelectorAll("table");
            for (const table of tables) {
              const rows = table.querySelectorAll("tbody tr");
              for (const row of rows) {
                const cells = Array.from(row.querySelectorAll("td")).map(
                  (td) => td.textContent?.trim() || ""
                );
                // Look for rows that might contain teacher names
                for (const cell of cells) {
                  // Teacher names: typically "Dr. Firstname Lastname" or "Prof. ..."
                  if (/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s/i.test(cell) || 
                      (/^[A-Z][a-z]+\s[A-Z][a-z]+/.test(cell) && cell.length > 5 && cell.length < 40)) {
                    const subjectCell = cells.find(
                      (c) => c !== cell && c.length > 3 && !/^\d+$/.test(c)
                    );
                    records.push({
                      name: cell,
                      subject: subjectCell || "",
                    });
                  }
                }
              }
            }
            return records;
          });

          for (const t of pageTeachers) {
            if (!teacherMap.has(t.name)) {
              teacherMap.set(t.name, {
                name: t.name,
                subject: t.subject,
                department: studentInfo.branch || "CSE",
              });
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore — we already have teachers from attendance data
    }

    const teachers = Array.from(teacherMap.values());
    log(`  👨‍🏫 Found ${teachers.length} unique teachers`);

    // ── Step 6: Try to get timetable / schedule info ────────
    log("📅 Checking for timetable data...");
    try {
      await page.goto(`${DASHBOARD_URL}?tab_id=1&config=student&h_tab_id=1`, {
        waitUntil: "networkidle2",
        timeout: 10000,
      });
      await safeWait(page, 1500);

      // Extract any additional data visible on the main dashboard
      const dashboardData = await page.evaluate(() => {
        const text = document.body.innerText;
        // Look for notices, announcements, or additional info
        const notices: string[] = [];
        document.querySelectorAll(".notice, .announcement, .alert-info, .card-body").forEach((el) => {
          const t = el.textContent?.trim();
          if (t && t.length > 10 && t.length < 500) notices.push(t);
        });
        return { notices };
      });

      if (dashboardData.notices.length > 0) {
        log(`  📅 Found ${dashboardData.notices.length} notices/announcements`);
      }
    } catch {
      // Not critical
    }

    log("✅ Scraping complete!");

    return {
      studentName: studentInfo.name,
      enrollmentNo: studentInfo.enrollment,
      branch: studentInfo.branch,
      semester: studentInfo.semester,
      attendance,
      lectures,
      teachers,
      scrapedAt: new Date(),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ── Import scraped data into MongoDB ──────────────────────────

export async function importScrapedData(db: any, data: ScrapedData, userId: string) {
  const results = {
    teachers: 0,
    attendanceRecords: 0,
    lectures: 0,
    studentUpdated: false,
  };

  const bcrypt = await import("bcryptjs");

  // ── Import Teachers ───────────────────────────────────────
  for (const teacher of data.teachers) {
    const existing = await db.collection("teachers").findOne({
      name: { $regex: new RegExp(`^${teacher.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (!existing) {
      await db.collection("teachers").insertOne({
        name: teacher.name,
        department: teacher.department || "Computer Science & Engineering",
        subject: teacher.subject,
        rating: 0,
        totalFeedback: 0,
        importedFrom: "simplifii",
        importedAt: new Date(),
      });
      results.teachers++;
    }
  }

  // ── Import Attendance Records ─────────────────────────────
  for (const att of data.attendance) {
    // Find the teacher
    const teacher = await db.collection("teachers").findOne({
      name: { $regex: new RegExp(att.teacherName?.split(" ")?.[0] || "xxx", "i") },
    });

    // Check if subjectwise summary already exists
    const existing = await db.collection("attendance_summary").findOne({
      studentId: userId,
      subject: att.subject,
    });

    if (!existing) {
      await db.collection("attendance_summary").insertOne({
        studentId: userId,
        studentName: data.studentName,
        subject: att.subject,
        teacherId: teacher?._id || null,
        teacherName: att.teacherName,
        totalClasses: att.totalClasses,
        attended: att.attended,
        percentage: att.percentage,
        status: att.status,
        importedFrom: "simplifii",
        importedAt: new Date(),
      });
      results.attendanceRecords++;
    }
  }

  // ── Import Lecture-wise Records ───────────────────────────
  for (const lecture of data.lectures) {
    const teacher = await db.collection("teachers").findOne({
      name: { $regex: new RegExp(lecture.teacherName?.split(" ")?.[0] || "xxx", "i") },
    });

    // Parse date
    let date: Date;
    try {
      date = new Date(lecture.date);
      if (isNaN(date.getTime())) {
        // Try DD/MM/YYYY or DD-MM-YYYY format
        const parts = lecture.date.split(/[-\/]/);
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
          date = new Date(year, month, day);
        } else {
          date = new Date();
        }
      }
    } catch {
      date = new Date();
    }

    // Avoid duplicate lectures
    const existing = await db.collection("attendance_records").findOne({
      studentName: data.studentName,
      subject: lecture.subject,
      date: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      },
      time: lecture.time || undefined,
    });

    if (!existing) {
      await db.collection("attendance_records").insertOne({
        studentId: userId,
        studentName: data.studentName,
        teacherId: teacher?._id || null,
        teacherName: lecture.teacherName || "",
        subject: lecture.subject,
        date: new Date(lecture.date || Date.now()),
        time: lecture.time || "",
        status: (lecture.status || "P").toLowerCase().startsWith("p") ? "present" : "absent",
        lectureType: lecture.lectureType || "Lecture",
        method: "simplifii_import",
        importedFrom: "simplifii",
        importedAt: new Date(),
      });
      results.lectures++;
    }
  }

  // ── Update student profile ────────────────────────────────
  if (data.studentName || data.enrollmentNo || data.branch) {
    const update: any = { simplifiiLinked: true };
    if (data.studentName) update.name = data.studentName;
    if (data.enrollmentNo) update.rollNumber = data.enrollmentNo;
    if (data.branch) update.department = data.branch;
    if (data.semester) update.semester = data.semester;

    await db.collection("users").updateOne(
      { _id: userId },
      { $set: update }
    );
    results.studentUpdated = true;
  }

  return results;
}
