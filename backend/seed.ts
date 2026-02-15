import { connectDb } from "./db";
import { storage } from "./storage";

const INITIAL_TEACHERS = [
  { name: "Shweta Kaushik", department: "Computer Science", subject: "Web Technology" },
  { name: "Tripti Pandey", department: "Computer Science", subject: "Machine Learning Techniques" },
  { name: "Ayush Aggarwal", department: "Computer Science", subject: "DBMS" },
  { name: "Shaili Gupta", department: "Computer Science", subject: "OOSD" },
  { name: "Shalini Singh", department: "Computer Science", subject: "DAA" },
  { name: "Bharat Bhardwaj", department: "Computer Science", subject: "COA" },
  { name: "Sanjeev Soni", department: "Computer Science", subject: "FSD" },
  { name: "Pratik Singh", department: "Computer Science", subject: "DSA" },
  { name: "Meenakshi Vishnoi", department: "Computer Science", subject: "OOPs with Java" },
];

async function seed() {
  console.log("Seeding database...");

  try {
    await connectDb();

    // Check if teachers already exist
    const existingTeachers = await storage.getTeachers();
    if (existingTeachers.length === 0) {
      console.log("Adding initial teachers...");
      for (const teacher of INITIAL_TEACHERS) {
        await storage.createTeacher(teacher);
      }
      console.log(`✅ Added ${INITIAL_TEACHERS.length} teachers`);
    } else {
      console.log(`ℹ️  Found ${existingTeachers.length} existing teachers, skipping teacher seed`);
    }

    // Create admin user if doesn't exist
    const existingAdmin = await storage.getUserByEmail("admin@edu.com");
    if (!existingAdmin) {
      console.log("Creating admin user...");
      await storage.createUser({
        username: "admin",
        email: "admin@edu.com",
        password: "admin123",
        name: "Administrator",
        role: "admin",
      });
      console.log("✅ Admin user created (admin@edu.com / admin123)");
    } else {
      console.log("ℹ️  Admin user already exists");
    }

    console.log("✅ Seeding complete!");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  }
}

export { seed };
