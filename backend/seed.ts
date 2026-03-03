import { connectDb } from "./db";
import { storage } from "./storage";

// ═══════════════════════════════════════════════════════════════
// Real college data — update these with YOUR institution's info
// ═══════════════════════════════════════════════════════════════

const DEPARTMENTS = [
  "Computer Science & Engineering",
  "Information Technology",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
];

const INITIAL_TEACHERS = [
  // CSE Department
  { name: "Shweta Kaushik", department: "Computer Science & Engineering", subject: "Web Technology" },
  { name: "Tripti Pandey", department: "Computer Science & Engineering", subject: "Data Science & Analytics" },
  { name: "Ayush Aggarwal", department: "Computer Science & Engineering", subject: "DBMS" },
  { name: "Shaili Gupta", department: "Computer Science & Engineering", subject: "OOSD" },
  { name: "Shalini Singh", department: "Computer Science & Engineering", subject: "DAA" },
  { name: "Bharat Bhardwaj", department: "Computer Science & Engineering", subject: "COA" },
  { name: "Sanjeev Soni", department: "Computer Science & Engineering", subject: "FSD" },
  { name: "Pratik Singh", department: "Computer Science & Engineering", subject: "DSA" },
  { name: "Meenakshi Vishnoi", department: "Computer Science & Engineering", subject: "OOPs with Java" },
  { name: "Rahul Sharma", department: "Computer Science & Engineering", subject: "Artificial Intelligence" },
  { name: "Priya Verma", department: "Computer Science & Engineering", subject: "Cloud Computing" },
  { name: "Deepak Kumar", department: "Computer Science & Engineering", subject: "Cyber Security" },
  // IT Department
  { name: "Ankita Jain", department: "Information Technology", subject: "Software Engineering" },
  { name: "Vikas Gupta", department: "Information Technology", subject: "Computer Networks" },
  { name: "Neha Saxena", department: "Information Technology", subject: "Operating Systems" },
  // ECE Department
  { name: "Rajesh Tiwari", department: "Electronics & Communication", subject: "Digital Electronics" },
  { name: "Sunita Yadav", department: "Electronics & Communication", subject: "Signal Processing" },
];

const DEMO_STUDENTS = [
  { name: "Devesh Singh", email: "devesh@college.edu", department: "Computer Science & Engineering" },
  { name: "Aditya Verma", email: "aditya@college.edu", department: "Computer Science & Engineering" },
  { name: "Priyanka Gupta", email: "priyanka@college.edu", department: "Computer Science & Engineering" },
  { name: "Rohit Sharma", email: "rohit@college.edu", department: "Information Technology" },
  { name: "Sneha Patel", email: "sneha@college.edu", department: "Information Technology" },
];

const SAMPLE_FEEDBACK = [
  { rating: 5, comment: "Excellent teaching methodology and very engaging lectures.", subject: "Web Technology" },
  { rating: 4, comment: "Good explanations but could use more practical examples.", subject: "DBMS" },
  { rating: 5, comment: "Best professor! Makes complex topics very easy to understand.", subject: "Data Science & Analytics" },
  { rating: 3, comment: "Decent teaching but needs to slow down a bit.", subject: "DSA" },
  { rating: 4, comment: "Very knowledgeable and helpful during office hours.", subject: "DAA" },
  { rating: 5, comment: "Inspiring teacher, makes you love the subject.", subject: "FSD" },
  { rating: 4, comment: "Well-structured course with good assignments.", subject: "COA" },
  { rating: 5, comment: "Explains concepts with real-world examples, highly recommended!", subject: "OOPs with Java" },
];

async function seed() {
  console.log("🌱 Seeding database with college data...");

  try {
    await connectDb();

    // ── Teachers ──────────────────────────────────────────────
    const existingTeachers = await storage.getTeachers();
    let teachers = existingTeachers;
    if (existingTeachers.length === 0) {
      console.log("  Adding teachers...");
      for (const teacher of INITIAL_TEACHERS) {
        await storage.createTeacher(teacher);
      }
      teachers = await storage.getTeachers();
      console.log(`  ✅ Added ${INITIAL_TEACHERS.length} teachers`);
    } else {
      console.log(`  ℹ️  Found ${existingTeachers.length} existing teachers, skipping`);
    }

    // ── Admin user ────────────────────────────────────────────
    const existingAdmin = await storage.getUserByEmail("admin@edu.com");
    if (!existingAdmin) {
      console.log("  Creating admin user...");
      await storage.createUser({
        username: "admin",
        email: "admin@edu.com",
        password: "admin123",
        name: "Administrator",
        role: "admin",
      });
      console.log("  ✅ Admin user created (admin@edu.com / admin123)");
    } else {
      console.log("  ℹ️  Admin user already exists");
    }

    // ── Demo students ─────────────────────────────────────────
    for (const student of DEMO_STUDENTS) {
      const exists = await storage.getUserByEmail(student.email);
      if (!exists) {
        await storage.createUser({
          username: student.email.split("@")[0],
          email: student.email,
          password: "student123",
          name: student.name,
          role: "student",
          department: student.department,
        });
        console.log(`  ✅ Student: ${student.name} (${student.email} / student123)`);
      }
    }

    // ── Demo teacher accounts (login-capable) ─────────────────
    for (const t of INITIAL_TEACHERS.slice(0, 3)) {
      const email = t.name.toLowerCase().replace(/\s+/g, ".") + "@college.edu";
      const exists = await storage.getUserByEmail(email);
      if (!exists) {
        await storage.createUser({
          username: email.split("@")[0],
          email,
          password: "teacher123",
          name: t.name,
          role: "teacher",
          department: t.department,
        });
        console.log(`  ✅ Teacher account: ${t.name} (${email} / teacher123)`);
      }
    }

    // ── Sample feedback ───────────────────────────────────────
    if (teachers.length > 0) {
      const students = await Promise.all(
        DEMO_STUDENTS.map((s) => storage.getUserByEmail(s.email))
      );
      const activeStudents = students.filter(Boolean);

      if (activeStudents.length > 0) {
        for (let i = 0; i < Math.min(SAMPLE_FEEDBACK.length, teachers.length); i++) {
          const fb = SAMPLE_FEEDBACK[i];
          const teacher = teachers[i % teachers.length];
          const student = activeStudents[i % activeStudents.length]!;

          try {
            await storage.createFeedback({
              teacherId: teacher.id,
              studentId: student.id,
              studentName: student.name,
              rating: fb.rating,
              comment: fb.comment,
              subject: fb.subject,
              isAnonymous: Math.random() > 0.5,
            });
          } catch {
            // Duplicate feedback (unique index) — skip silently
          }
        }
        console.log("  ✅ Sample feedback seeded");
      }
    }

    console.log("🌱 Seeding complete!");
    console.log("");
    console.log("  Demo credentials:");
    console.log("  ──────────────────────────────────────");
    console.log("  Admin   : admin@edu.com / admin123");
    console.log("  Teacher : shweta.kaushik@college.edu / teacher123");
    console.log("  Student : devesh@college.edu / student123");
    console.log("  ──────────────────────────────────────");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  }
}

export { seed };
