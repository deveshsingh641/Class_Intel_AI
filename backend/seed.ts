import { connectDb } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { UserModel, QuizModel } from "@shared/schema";
import mongoose from "mongoose";

// Real college data and institutional configuration parameters

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

    // Seeding teachers individually if they don't already exist (non-destructive)
    console.log("  Seeding teachers...");
    for (const teacher of INITIAL_TEACHERS) {
      const exists = await storage.getTeacherByName(teacher.name);
      if (!exists) {
        await storage.createTeacher(teacher);
        console.log(`    ✅ Added teacher: ${teacher.name}`);
      }
    }
    const teachers = await storage.getTeachers();
    console.log(`  Total teachers in database: ${teachers.length}`);

    // Admin user
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
      // If the admin user exists already (e.g. from a previous run) but the
      // password differs, reset it so the demo credentials in the UI remain valid.
      const demoPassword = "admin123";
      const matches = await bcrypt.compare(demoPassword, existingAdmin.password);
      if (!matches) {
        const hashed = await bcrypt.hash(demoPassword, 10);
        await UserModel.updateOne(
          { email: "admin@edu.com" },
          {
            $set: {
              password: hashed,
              role: "admin",
              name: existingAdmin.name || "Administrator",
              username: existingAdmin.username || "admin",
            },
          },
        );
        console.log("  🔁 Admin password reset to demo default (admin123)");
      } else {
        console.log("  ℹ️  Admin user already exists");
      }
    }

    // Demo students
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
      } else {
        const matches = await bcrypt.compare("student123", exists.password);
        if (!matches) {
          const hashed = await bcrypt.hash("student123", 10);
          await UserModel.updateOne(
            { email: student.email },
            { $set: { password: hashed } }
          );
          console.log(`  🔁 Reset student password for: ${student.name}`);
        }
      }
    }

    // Demo teacher accounts (login-capable)
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
      } else {
        const matches = await bcrypt.compare("teacher123", exists.password);
        if (!matches) {
          const hashed = await bcrypt.hash("teacher123", 10);
          await UserModel.updateOne(
            { email },
            { $set: { password: hashed } }
          );
          console.log(`  🔁 Reset teacher password for: ${t.name}`);
        }
      }
    }

    // Sample feedback
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

    // Remove old test quiz with difficulty in title if it exists
    await QuizModel.deleteOne({ title: "Full-Stack CSE Prep Quiz (Medium to Hard)" });

    const SUBJECT_QUIZZES: Record<string, Array<{ question: string; options: string[]; correctAnswer: number; points: number }>> = {
      "Web Technology": [
        {
          question: "Which of the following is true regarding the event loop in JavaScript?",
          options: [
            "Macro-tasks are executed before micro-tasks inside the event loop cycle.",
            "Micro-task queue has higher priority, running immediately after the current call stack clears.",
            "Web APIs execute code directly on the main JavaScript engine thread.",
            "SetTimeout callbacks are placed in the micro-task queue."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the SameSite=Lax cookie attribute specify?",
          options: [
            "Cookies are never sent on cross-site requests.",
            "Cookies are sent on all cross-site subresource requests like images.",
            "Cookies are withheld on cross-site subresource requests but sent during top-level cross-site navigations.",
            "Cookies are only sent on secure HTTPS connections."
          ],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "How does CSS grid differs from Flexbox in terms of layout design?",
          options: [
            "Grid is strictly 1-dimensional, while Flexbox is 2-dimensional.",
            "Grid works from the layout in (2D space), whereas Flexbox works from the content out (1D space).",
            "Grid does not support content alignment properties.",
            "Flexbox does not allow items to wrap onto multiple lines."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the primary role of a Service Worker in a Progressive Web App (PWA)?",
          options: [
            "To synchronize database transactions locally with MongoDB.",
            "To intercept network requests, serve cached resources offline, and run background synchronization.",
            "To compile JSX code into JavaScript on the client side.",
            "To establish high-speed WebRTC peer-to-peer data channels."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which DOM event propagation phase occurs first when an element is clicked?",
          options: [
            "Target phase",
            "Bubbling phase",
            "Capturing phase",
            "Verification phase"
          ],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the function of the Content Security Policy (CSP) header?",
          options: [
            "To encrypt all payload data transferred between client and server.",
            "To restrict the resources (such as JavaScript, CSS, Images) that the browser is allowed to load for a given page.",
            "To check if the user is authenticated via OAuth.",
            "To accelerate static asset delivery using CDN routing."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In standard HTTP/2, how is head-of-line blocking resolved compared to HTTP/1.1?",
          options: [
            "By enforcing mandatory SSL/TLS compression.",
            "By multiplexing multiple requests and responses over a single TCP connection using binary framing.",
            "By opening up to 6 separate parallel TCP connections per host.",
            "By caching request headers on local edge routers."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of CORS (Cross-Origin Resource Sharing) headers?",
          options: [
            "To bypass router firewall settings.",
            "To allow servers to specify which origins are permitted to read their API responses in a web browser.",
            "To speed up cross-origin routing lookup speeds.",
            "To prevent SQL injection attacks on HTTP requests."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which of the following describes the difference between local storage and session storage?",
          options: [
            "Local storage has 10MB limit; Session storage has no limit.",
            "Local storage data persists indefinitely; Session storage data is cleared when the page session/tab ends.",
            "Local storage only stores binary buffers; Session storage stores key-value strings.",
            "Local storage is sent to the server on every HTTP request; Session storage is local."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In Web Audio API, what is the role of an AudioNode?",
          options: [
            "To store visual waveforms for rendering on a canvas.",
            "To represent audio sources, effects, or destinations connected in a modular routing graph.",
            "To decode MP3 files into raw PCM text documents.",
            "To verify user microphones are connected via USB."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "DBMS": [
        {
          question: "Which normal form guarantees the elimination of all multi-valued dependencies?",
          options: ["Second Normal Form (2NF)", "Third Normal Form (3NF)", "Boyce-Codd Normal Form (BCNF)", "Fourth Normal Form (4NF)"],
          correctAnswer: 3,
          points: 10
        },
        {
          question: "What is the primary function of a write-ahead log (WAL) in database recovery?",
          options: [
            "To log user access logs for security audits.",
            "To ensure transaction updates are committed to the transaction log before database pages are written to disk.",
            "To index foreign key relationships for speed.",
            "To keep a copy of deleted records for rollback transactions."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In transaction isolation levels, what is a phantom read?",
          options: [
            "A transaction re-reads a row and finds different column values modified by a committed transaction.",
            "A transaction reads uncommitted changes from another transaction.",
            "A transaction queries a set of rows matching a condition, and a second transaction inserts/deletes rows matching it before commit.",
            "A transaction reads data that was cached locally on another node."
          ],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "Which lock type is used when a database transaction wants to modify a row in a table?",
          options: ["Shared Lock (S)", "Exclusive Lock (X)", "Intent Shared Lock (IS)", "Schema Lock"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "How does a B+ Tree index differ from a standard B-Tree index?",
          options: [
            "B+ Trees store data pointers in leaf nodes only; B-Trees store data pointers in both internal and leaf nodes.",
            "B+ Trees are binary trees, while B-Trees can have multiple children.",
            "B+ Trees do not support range search queries.",
            "B-Trees use linked list pointers to join sibling leaf nodes."
          ],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "What is the purpose of the query optimizer in an RDBMS?",
          options: [
            "To run backup scripts at scheduled intervals.",
            "To analyze SQL queries and determine the most efficient execution plan based on cost and statistics.",
            "To validate user login credentials.",
            "To normalize tables dynamically."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In database replication, what is the key drawback of synchronous replication?",
          options: [
            "Risk of data loss on primary node failure.",
            "Write latency increases because the primary must wait for confirmations from replicas.",
            "Replicas can read uncommitted transactions.",
            "It requires expensive load balancers."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which SQL join returns all records when there is a match in either left or right table records?",
          options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL OUTER JOIN"],
          correctAnswer: 3,
          points: 10
        },
        {
          question: "What does the ACID property 'Consistency' guarantee?",
          options: [
            "Multiple users see the same data at the same time.",
            "A transaction will bring the database from one valid state to another, maintaining all schema constraints.",
            "Transactions run concurrently without interference.",
            "Data survives system crashes."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a clustered index in databases?",
          options: [
            "An index that stores keys clustered in memory arrays.",
            "An index that physically reorders the data rows in the table to match the index keys.",
            "An index built on multiple columns.",
            "An index that contains only foreign keys."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Data Science & Analytics": [
        {
          question: "In Machine Learning, what does the bias-variance tradeoff specify?",
          options: [
            "High bias models suffer from overfitting; High variance models underfit.",
            "High bias models represent underfitting; High variance models represent overfitting.",
            "Bias and variance can both be minimized to zero simultaneously.",
            "Variance refers to the systematic error of the predictor."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which of the following evaluation metrics is most appropriate for a highly imbalanced classification dataset?",
          options: ["Accuracy", "Mean Absolute Error", "F1-Score / Precision-Recall AUC", "R-Squared"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the primary objective of Principal Component Analysis (PCA)?",
          options: [
            "To split dataset into test and training subsets.",
            "To reduce dimensionality while preserving as much variance as possible.",
            "To group records into K distinct clusters.",
            "To optimize neural network weight updates."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of L1 regularization (Lasso) in regression models?",
          options: [
            "To force weights to be small but non-zero.",
            "To introduce feature selection by driving some coefficient weights to exactly zero.",
            "To scale features between 0 and 1.",
            "To prevent gradient explosion in deep learning."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does a p-value of less than 0.05 in statistical hypothesis testing indicate?",
          options: [
            "There is a 5% chance the null hypothesis is true.",
            "The alternative hypothesis is false.",
            "Strong evidence against the null hypothesis, suggesting rejection of the null hypothesis.",
            "The sample size is too small to draw conclusions."
          ],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "Which algorithm uses a hyperplane to separate class elements with maximum margin?",
          options: ["K-Means Clustering", "Support Vector Machines (SVM)", "Random Forest", "Logistic Regression"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the main advantage of Random Forest over a single Decision Tree?",
          options: [
            "Random Forest is faster to train.",
            "Random Forest reduces overfitting by averaging predictions of multiple independent trees.",
            "Random Forest model is easier to interpret visually.",
            "Random Forest requires less memory."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In clustering, how is the optimal number of clusters K determined in the Elbow Method?",
          options: [
            "By finding the point where the Sum of Squared Errors (SSE) drops to zero.",
            "By identifying the point of inflection where adding another cluster doesn't yield significantly better SSE.",
            "By picking the maximum value of K possible.",
            "By sorting the distance coefficients."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the term 'Data Leakage' refer to in data science workflows?",
          options: [
            "Unauthorized access to database tables by third parties.",
            "The accidental inclusion of target information from the test dataset inside the training dataset.",
            "Data loss during cloud transmission.",
            "Corrupted values in columns."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which activation function is most commonly used in the output layer of a multi-class neural network classifier?",
          options: ["Sigmoid", "ReLU", "Tanh", "Softmax"],
          correctAnswer: 3,
          points: 10
        }
      ],
      "OOSD": [
        {
          question: "Which SOLID design principle states that software entities should be open for extension but closed for modification?",
          options: ["Single Responsibility Principle", "Open-Closed Principle", "Liskov Substitution Principle", "Dependency Inversion Principle"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the primary focus of the Creational patterns in software design?",
          options: [
            "How classes and objects are composed to form larger structures.",
            "How objects interact and distribute responsibility.",
            "Mechanisms of object creation, decoupling the creation logic from system instantiation.",
            "How database models map to tables."
          ],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "In UML diagrams, what does a hollow diamond shape on a connection line represent?",
          options: ["Generalization", "Aggregation (has-a relation, weak lifecycle bind)", "Composition (part-of relation, strong lifecycle bind)", "Realization"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the key advantage of using the Dependency Inversion Principle?",
          options: [
            "It speeds up execution times.",
            "It decouples high-level modules from low-level modules by introducing abstractions.",
            "It reduces the size of compiled code.",
            "It automatically garbage collects unused references."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which design pattern is used to attach new responsibilities to an object dynamically without modifying its class code?",
          options: ["Decorator Pattern", "Adapter Pattern", "Proxy Pattern", "Singleton Pattern"],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "What does Liskov Substitution Principle state?",
          options: [
            "Subclasses should hide implementation details of base classes.",
            "Objects of a superclass should be replaceable with objects of its subclasses without breaking application logic.",
            "Methods must be limited to 5 arguments.",
            "A class should only implement one interface."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which design pattern defines a one-to-many dependency so that when one object changes state, all dependents are notified?",
          options: ["Strategy Pattern", "Observer Pattern", "Command Pattern", "State Pattern"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In software architecture, what is the role of the Model-View-Controller (MVC) pattern?",
          options: [
            "To manage server cluster nodes.",
            "To separate representation of information from user interaction details.",
            "To automatically log server trace statistics.",
            "To encrypt connection sockets."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between an abstract class and an interface in OOP design?",
          options: [
            "Interfaces can hold state fields; Abstract classes cannot.",
            "Abstract classes can provide partial implementation; Interfaces (historically) define only contract signatures.",
            "Classes can extend multiple abstract classes; but implement only one interface.",
            "Interfaces are compiled differently in JVM."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which design pattern provides a unified interface to a set of interfaces in a subsystem, making it easier to use?",
          options: ["Facade Pattern", "Adapter Pattern", "Composite Pattern", "Bridge Pattern"],
          correctAnswer: 0,
          points: 10
        }
      ],
      "DAA": [
        {
          question: "What is the worst-case time complexity of the randomized QuickSort algorithm?",
          options: ["O(n log n)", "O(n^2)", "O(log n)", "O(2^n)"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which algorithm design paradigm is used in finding the Longest Common Subsequence (LCS)?",
          options: ["Greedy Approach", "Divide and Conquer", "Dynamic Programming", "Backtracking"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What does the Master Theorem solve?",
          options: [
            "Worst-case search queries on B-Trees.",
            "Recurrence relations expressing time complexities of divide-and-conquer algorithms.",
            "Matrix multiplication dimensions.",
            "Graph traversal path optimizations."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In graph algorithms, what is the time complexity of Dijkstra's algorithm using a binary heap?",
          options: ["O(V^2)", "O(E log V)", "O(V + E)", "O(V E)"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the key difference between Prim's and Kruskal's Minimum Spanning Tree algorithms?",
          options: [
            "Prim's algorithm grows a tree node-by-node; Kruskal's algorithm groups edges in a forest and joins components.",
            "Prim's is faster on sparse graphs than Kruskal's.",
            "Kruskal's algorithm works only on directed graphs.",
            "Prim's algorithm handles negative edge weights, Kruskal's does not."
          ],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "Which of the following problems is known to be NP-Complete?",
          options: ["Single-Source Shortest Path", "Traveling Salesperson Decision Problem", "Minimum Cut", "Eulerian Path"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the term 'memoization' refer to in algorithm optimization?",
          options: [
            "Converting recursive calls to nested loops.",
            "Storing results of expensive function calls and returning the cached result when the same inputs occur again.",
            "Allocating memory pools statically.",
            "Compiling code to machine language."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which sorting algorithm is stable and has O(n log n) worst-case time complexity?",
          options: ["QuickSort", "HeapSort", "MergeSort", "SelectionSort"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "In dynamic programming, what is the optimal substructure property?",
          options: [
            "The problem has a solution that requires minimal memory allocation.",
            "An optimal solution to the problem contains within it optimal solutions to subproblems.",
            "The subproblems do not overlap.",
            "The algorithm executes in linear time."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the time complexity of building a heap of n elements?",
          options: ["O(n log n)", "O(n)", "O(log n)", "O(n^2)"],
          correctAnswer: 1,
          points: 10
        }
      ],
      "COA": [
        {
          question: "What is the role of a program counter (PC) in CPU register organization?",
          options: [
            "To count the number of programs running on the system.",
            "To hold the address of the next instruction to be fetched from memory.",
            "To store intermediate arithmetic results.",
            "To manage cache line evictions."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which pipeline hazard occurs when instructions in different stages depend on the same registers?",
          options: ["Structural Hazard", "Control Hazard", "Data Hazard", "Memory Hazard"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "In memory hierarchy, how does cache associative mapping differ from direct mapping?",
          options: [
            "Direct mapping is slower than associative mapping.",
            "Associative mapping allows any block of memory to be placed in any cache line, reducing collision misses.",
            "Direct mapping requires no index checks.",
            "Associative mapping uses twice the RAM capacity."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the term 'microprogramming' mean?",
          options: [
            "Programming microcontrollers in assembly.",
            "A control unit design method where instructions are executed by executing a series of microinstructions stored in control memory.",
            "Writing small script modules.",
            "Compiler code generation phase."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which cache eviction algorithm replaces the line that has not been accessed for the longest duration?",
          options: ["First-In First-Out (FIFO)", "Least Recently Used (LRU)", "Random Replacement", "Least Frequently Used (LFU)"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is write-through policy in cache memory writes?",
          options: [
            "Data is written only to cache and later copied to main memory.",
            "Data is written to both cache memory and main memory simultaneously.",
            "Data is written directly to disk bypassing cache.",
            "Data is written only to registers."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does RISC stand for?",
          options: [
            "Rapid Instruction Set Computer",
            "Reduced Instruction Set Computer",
            "Redundant Integrated System Controller",
            "Reliable Instruction Storage Cache"
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In addressing modes, how is the effective address computed in Indexed Addressing?",
          options: [
            "The address field contains the effective address.",
            "The value in the index register is added to the base address specified in the instruction.",
            "By dereferencing a pointer in memory.",
            "By reading the stack pointer register."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is DMA (Direct Memory Access) used for?",
          options: [
            "To allow memory chips to communicate directly without motherboard lines.",
            "To allow I/O devices to transfer data directly to/from main memory without constant CPU intervention.",
            "To allocate variable space dynamically.",
            "To clear CPU registers."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of instruction pipelining?",
          options: [
            "To increase the clock speed of the processor.",
            "To execute multiple instructions concurrently by overlapping their execution phases, improving throughput.",
            "To reduce CPU heat generation.",
            "To increase the size of memory registers."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "FSD": [
        {
          question: "Which HTTP status code represents a resource creation success?",
          options: ["200 OK", "201 Created", "204 No Content", "302 Found"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In React, what does the dependency array of the useEffect hook control?",
          options: [
            "Which components can access the hook's context.",
            "When the effect callback should re-run, based on changes in the specified variables.",
            "How React compiles the component code.",
            "The memory size of state states."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "How does JWT (JSON Web Token) authentication secure user sessions?",
          options: [
            "By storing session state in server memory.",
            "By sending cryptographically signed JSON payloads containing user claims from client to server.",
            "By keeping a continuous WebSocket connection open.",
            "By hashing URL variables."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the primary role of middleware in Express.js?",
          options: [
            "To compile CSS styles.",
            "To execute code, modify request/response objects, and end requests or pass control using next().",
            "To establish database index relationships.",
            "To compress files on disk."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the SameSite attribute on cookies prevent when configured properly?",
          options: ["SQL Injection", "Cross-Site Request Forgery (CSRF)", "Cross-Site Scripting (XSS)", "Denial of Service (DoS)"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which of the following describes the Virtual DOM concept in React?",
          options: [
            "A virtual window object that wraps around standard browser variables.",
            "A lightweight in-memory representation of the real DOM used to compute differences before updating browser UI.",
            "A database abstraction layer.",
            "A browser extension for debugging layouts."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does Node.js use to execute asynchronous non-blocking I/O operations?",
          options: ["A multi-threaded processing pool.", "An event-driven non-blocking single-threaded loop powered by libuv.", "A database worker thread.", "Static cache lines."],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which mechanism protects database passwords from brute force attacks if the database gets leaked?",
          options: ["Using symmetric encryption", "Salting and hashing using slow algorithms like bcrypt/Argon2", "Encoding with Base64", "Storing them in binary tables"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between PUT and PATCH methods in RESTful API design?",
          options: [
            "PUT is asynchronous; PATCH is synchronous.",
            "PUT replaces the entire resource representation; PATCH applies partial modifications to the resource.",
            "PUT does not accept body payloads; PATCH does.",
            "PUT is used for deleting files; PATCH for creating them."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does connection pooling achieve in backend database connections?",
          options: [
            "It aggregates multiple databases in a cluster.",
            "It maintains a cache of open database connections that can be reused, reducing overhead of creating new connections.",
            "It compresses sql strings.",
            "It blocks unauthorized queries."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "DSA": [
        {
          question: "What is the time complexity of inserting an item at the beginning of a singly linked list?",
          options: ["O(1)", "O(n)", "O(log n)", "O(n^2)"],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "Which data structure is typically used to implement Breadth-First Search (BFS) in graphs?",
          options: ["Stack", "Queue", "Priority Queue", "Binary Search Tree"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the worst-case search complexity in a Hash Table when many keys hash to the same bucket (collision)?",
          options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "Which binary tree traversal visits the nodes in sorted order if the tree is a Binary Search Tree (BST)?",
          options: ["Pre-order traversal", "In-order traversal", "Post-order traversal", "Level-order traversal"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the height balance factor condition of an AVL tree node?",
          options: [
            "The heights of left and right subtrees must be exactly equal.",
            "The absolute difference between left and right subtree heights must be at most 1.",
            "The left subtree must be deeper than the right subtree.",
            "No node can have more than two children."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In a min-heap data structure, where is the smallest key located?",
          options: ["In the leftmost leaf node", "At the root node", "In the rightmost leaf node", "In the parent of the root"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the main advantage of an Adjacency List over an Adjacency Matrix for graph representation?",
          options: [
            "It makes checking if an edge exists between two nodes faster.",
            "It saves space when representing sparse graphs.",
            "It is easier to implement in SQL databases.",
            "It allows constant-time vertex deletions."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which data structure uses the LIFO (Last-In First-Out) access rule?",
          options: ["Queue", "Stack", "Min-Heap", "Circular Array"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the best-case time complexity of the bubble sort algorithm when the input array is already sorted?",
          options: ["O(n log n)", "O(n)", "O(1)", "O(n^2)"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a collisions resolution technique in hash tables that chains elements together?",
          options: ["Open Addressing", "Chaining (using linked lists)", "Linear Probing", "Quadratic Probing"],
          correctAnswer: 1,
          points: 10
        }
      ],
      "OOPs with Java": [
        {
          question: "What is dynamic method dispatch in Java?",
          options: [
            "A mechanism where JVM resolves overridden methods at compile time.",
            "A mechanism where JVM resolves overridden methods at runtime based on the actual object type.",
            "Calling a static method inside a final block.",
            "Creating new thread classes."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between final, finally, and finalize in Java?",
          options: [
            "They are synonymous keywords.",
            "final modifies classes/methods/variables; finally is a try-catch block; finalize is a deprecated garbage collection method.",
            "final is for constants; finally executes only on errors; finalize compiles class binaries.",
            "final is for interface methods; finally is for thread control; finalize is a constructor."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In Java memory management, where are objects instantiated?",
          options: ["Stack memory", "Heap memory", "Control unit registers", "Class area memory"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which keyword is used to prevent a class from being inherited in Java?",
          options: ["static", "abstract", "final", "private"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the purpose of interface default methods introduced in Java 8?",
          options: [
            "To enforce static initialization.",
            "To allow interfaces to have method implementations without breaking existing implementing classes.",
            "To create private utility methods.",
            "To replace abstract classes entirely."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which of the following classes is thread-safe?",
          options: ["ArrayList", "HashMap", "Vector / ConcurrentHashMap", "StringBuilder"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the checked exception in Java?",
          options: [
            "An exception verified and handled at runtime.",
            "An exception that must be declared in throws or caught in try-catch at compile-time.",
            "An exception that causes JVM to exit.",
            "An exception thrown by the garbage collector."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the transient keyword signify on a class field?",
          options: [
            "The field should be encrypted.",
            "The field should not be serialized during object serialization.",
            "The field is volatile across thread caches.",
            "The field is static."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "How does abstract class differ from interface in Java 9?",
          options: [
            "Interfaces can have private methods, default methods, static methods, but cannot hold instance fields; Abstract classes can hold instance fields.",
            "Interfaces can extend multiple abstract classes.",
            "Abstract classes can be instantiated directly.",
            "Interfaces cannot define abstract signatures."
          ],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "What is Java Garbage Collection?",
          options: [
            "A tool to clean up hard disk files.",
            "An automatic process that reclaims heap memory by destroying unreachable objects.",
            "A JVM compiler optimization phase.",
            "A script to delete empty classes."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Artificial Intelligence": [
        {
          question: "Which search algorithm uses heuristic information to expand the most promising nodes first?",
          options: ["Breadth-First Search", "Depth-First Search", "A* Search / Greedy Best-First", "Uniform Cost Search"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the primary role of the backpropagation algorithm in neural networks?",
          options: [
            "To classify target labels directly.",
            "To calculate the gradient of the loss function with respect to the network weights, passing errors backward.",
            "To prune inactive neurons.",
            "To download datasets."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the term 'Overfitting' mean in machine learning?",
          options: [
            "The model does not perform well on training data.",
            "The model performs exceptionally well on training data but fails to generalize to unseen test data.",
            "The model has too few layers.",
            "The model training completes too quickly."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between supervised and unsupervised learning?",
          options: [
            "Supervised learning uses unlabeled data; Unsupervised uses labeled data.",
            "Supervised learning requires labeled training data; Unsupervised learning finds hidden structures in unlabeled data.",
            "Supervised learning is only for classification; Unsupervised is only for regression.",
            "Supervised learning does not use algorithms."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In Minimax search, what does alpha-beta pruning achieve?",
          options: [
            "It increases the depth of the search tree.",
            "It decreases the number of nodes evaluated in the search tree by pruning branches that cannot influence the final decision.",
            "It randomizes the move selections.",
            "It forces the opponent to play suboptimally."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which of the following is a classic example of a reinforcement learning framework component?",
          options: ["Labels, features, and Hyperplanes", "Agent, Environment, States, Actions, and Rewards", "Data cleansing, splitting, and scaling", "Input layers, hidden layers, and activation units"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the Turing Test designed to evaluate?",
          options: [
            "A system's database speed.",
            "A machine's ability to exhibit intelligent behavior equivalent to, or indistinguishable from, that of a human.",
            "Code execution accuracy.",
            "Network encryption strength."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a convolutional neural network (CNN) primarily used for?",
          options: ["Natural Language Processing word embeddings", "Computer Vision and Image Processing tasks", "Tabular database regressions", "Time series scheduling"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In AI, what does an Expert System do?",
          options: [
            "Monitors server performance.",
            "Emulates the decision-making ability of a human expert using a knowledge base and inference engine.",
            "Hosts code repositories.",
            "Encrypts data files."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of the cost/loss function in neural networks?",
          options: [
            "To measure how well the network is predicting the target value compared to the actual label.",
            "To restrict the depth of active trees.",
            "To count parameters.",
            "To normalize image dimensions."
          ],
          correctAnswer: 0,
          points: 10
        }
      ],
      "Cloud Computing": [
        {
          question: "What is the key characteristic of serverless computing (e.g., AWS Lambda)?",
          options: [
            "No physical servers are involved in execution.",
            "Developers write functions, and the cloud provider manages server provisioning, scaling, and execution charged on usage.",
            "It runs only in private on-premise data centers.",
            "It does not support API calls."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In cloud models, what is the difference between IaaS and PaaS?",
          options: [
            "IaaS provides physical racks; PaaS provides network wires.",
            "IaaS provides virtualized computing infrastructure (VMs, storage); PaaS provides a managed platform for application deployment.",
            "IaaS is only private; PaaS is only public.",
            "IaaS does not require software licenses."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does 'Elasticity' mean in Cloud Computing?",
          options: [
            "Storing backup files in compressed archives.",
            "The ability to dynamically scale resources up or down in response to real-time traffic and demand.",
            "Linking databases with virtual networks.",
            "Running multiple virtual instances of different OSs."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the function of a Load Balancer in cloud architecture?",
          options: [
            "To encrypt file backups.",
            "To distribute incoming network traffic across a group of backend servers to prevent overload and ensure availability.",
            "To limit the speed of database updates.",
            "To register DNS domains."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of a CDN (Content Delivery Network) in cloud services?",
          options: [
            "To host backend APIs.",
            "To cache static content at edge locations geographically closer to users to reduce latency.",
            "To block malicious ports.",
            "To sync databases between zones."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does a multi-tenant model imply?",
          options: [
            "Multiple cloud providers sharing the same data center.",
            "A single instance of software running on a server serving multiple customer organizations (tenants) securely.",
            "An application running on multiple operating systems.",
            "An API requiring multiple authorization tokens."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a Hybrid Cloud?",
          options: [
            "A network combining SQL and NoSQL databases.",
            "A computing environment combining a private cloud/on-premise data center with a public cloud service.",
            "A system supporting multiple programming languages.",
            "A cluster of servers using mixed processors."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is virtualization in cloud computing?",
          options: [
            "Writing mock code for API testing.",
            "The technology of creating virtual instances of physical computing resources (CPU, RAM, Storage) on a host machine.",
            "Displaying system stats on visual dashboards.",
            "Caching data inside memory blocks."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In cloud storage, what is object storage (e.g., S3) optimized for?",
          options: [
            "Structured transactional database tables.",
            "Unstructured data (images, videos, backups) stored as objects with metadata and unique identifiers.",
            "Low-latency filesystem block operations.",
            "Caching active user sessions."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of Auto-Scaling in cloud deployments?",
          options: [
            "To increase server speeds dynamically.",
            "To automatically adjust the number of active server instances based on defined triggers (CPU load, request volume).",
            "To compress log files.",
            "To renew domain certificates."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Cyber Security": [
        {
          question: "What is the main difference between symmetric and asymmetric cryptography?",
          options: [
            "Symmetric encryption is slow; Asymmetric is fast.",
            "Symmetric uses the same key for encryption and decryption; Asymmetric uses a public key to encrypt and private key to decrypt.",
            "Symmetric is only used for files; Asymmetric is only for emails.",
            "Symmetric is not secure."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which of the following describes a Man-in-the-Middle (MitM) attack?",
          options: [
            "An attacker guesses passwords using brute-force.",
            "An attacker intercepts and alters communications between two parties who believe they are communicating directly.",
            "An attacker floods a server with requests to crash it.",
            "An attacker injects malware into USB drives."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of salting a password before hashing it?",
          options: [
            "To compress the password length.",
            "To append unique random data to the password before hashing, preventing precomputed lookup table (rainbow table) attacks.",
            "To check if the password contains special characters.",
            "To encrypt the password using AES."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a SQL Injection attack?",
          options: [
            "Inserting viruses into database files.",
            "Injecting malicious SQL code into input fields to manipulate database queries and bypass authorization.",
            "Causing database buffer overflows.",
            "Deleting database indexes."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "How does a firewall protect a network?",
          options: [
            "By scanning files for active viruses.",
            "By monitoring and filtering incoming/outgoing network traffic based on established security rules.",
            "By encrypting data packets.",
            "By backup-saving data folders."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does MFA (Multi-Factor Authentication) require?",
          options: [
            "Multiple user passwords.",
            "Providing two or more independent credentials categories (something you know, something you have, something you are) to verify identity.",
            "Logging in from multiple browser tabs.",
            "Checking database user roles."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is Cross-Site Scripting (XSS)?",
          options: [
            "Intercepting HTTP traffic.",
            "Injecting malicious scripts into trusted websites, which execute in the victim's browser context.",
            "Crashing the database service.",
            "Stealing files from servers."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between a vulnerability scan and a penetration test?",
          options: [
            "A scan is manual; a pen test is automated.",
            "A scan identifies known security gaps; a pen test actively exploits vulnerabilities to assess actual security posture.",
            "A scan is illegal; a pen test is legal.",
            "A scan fixes bugs; a pen test finds them."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which cryptographic protocol is used to secure web browser traffic (HTTP to HTTPS)?",
          options: ["SSH", "TLS (Transport Layer Security)", "IPSec", "DNSSEC"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a DDoS (Distributed Denial of Service) attack?",
          options: [
            "An attacker gains admin credentials.",
            "An attacker overwhelms a target system with traffic from multiple distributed compromised systems (botnets) to deny access.",
            "A script that deletes database tables.",
            "An injection of script files."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Software Engineering": [
        {
          question: "What is the main difference between Agile and Waterfall SDLC models?",
          options: [
            "Agile is document-heavy; Waterfall has no documents.",
            "Agile is iterative and adapts to changing requirements; Waterfall is linear and sequential, completing one phase before the next.",
            "Agile is only for web apps; Waterfall is for desktop apps.",
            "Agile does not involve code testing."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In software testing, what does code coverage measure?",
          options: [
            "The file sizes of the test scripts.",
            "The proportion of source code executed during automated test runs.",
            "The speed of test execution.",
            "The number of bugs found."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of version control (e.g., Git)?",
          options: [
            "To host code on cloud databases.",
            "To track changes to source code over time, allowing collaborative development and rollbacks.",
            "To check compile errors.",
            "To speed up database transactions."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between verification and validation in software engineering?",
          options: [
            "Verification is runtime check; Validation is compile check.",
            "Verification checks if we are building the product right (process match); Validation checks if we built the right product (client match).",
            "Verification is manual; Validation is automated.",
            "They are the same thing."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is refactoring in software development?",
          options: [
            "Rewriting code in a different language.",
            "Modifying code's internal structure to improve readability and maintainability without changing its external behavior.",
            "Fixing crash bugs on production.",
            "Adding new UI pages."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is CI/CD (Continuous Integration / Continuous Deployment)?",
          options: [
            "A method of copying files to staging.",
            "A practice of automatically integrating code changes, running tests, and deploying updates to production systems.",
            "A style of database configuration.",
            "A routing protocol."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which diagram in UML represents the dynamic sequence of interactions between objects over time?",
          options: ["Class Diagram", "Sequence Diagram", "Use Case Diagram", "Deployment Diagram"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is integration testing?",
          options: [
            "Testing a single unit of code in isolation.",
            "Testing combined components or modules together to verify they interact correctly.",
            "Testing system security thresholds.",
            "Testing database indexing speeds."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In Scrum methodology, what is a sprint?",
          options: [
            "A fast programming session.",
            "A time-boxed iteration (usually 1-4 weeks) during which a specific set of work must be completed and made ready for review.",
            "A database optimization phase.",
            "A daily standup meeting."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the purpose of a software requirements specification (SRS) document?",
          options: [
            "To list code files.",
            "To describe the functional and non-functional requirements of the software system to align stakeholders.",
            "To document database schema columns.",
            "To write API code templates."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Computer Networks": [
        {
          question: "What is the function of the DNS (Domain Name System)?",
          options: [
            "To encrypt connection packets.",
            "To translate human-readable domain names (like google.com) into machine-readable IP addresses.",
            "To speed up browser cache speeds.",
            "To verify user email accounts."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which protocol in the Transport Layer guarantees reliable, ordered packet delivery?",
          options: ["UDP", "TCP", "IP", "ICMP"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the primary role of a router in a network?",
          options: [
            "To store website files.",
            "To forward data packets between computer networks, directing traffic along optimal paths.",
            "To assign IP addresses to devices dynamically.",
            "To compile network queries."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "How does DHCP (Dynamic Host Configuration Protocol) simplify network setup?",
          options: [
            "By encrypting local network queries.",
            "By automatically assigning IP addresses, subnet masks, and gateway settings to devices joining the network.",
            "By caching domain pages.",
            "By routing packets between subnets."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the three-way handshake used for in TCP connection establishment?",
          options: [
            "To exchange cryptographic certificates.",
            "To synchronize sequence numbers and establish a virtual session link (SYN, SYN-ACK, ACK).",
            "To check DNS records.",
            "To compress HTTP headers."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between IPv4 and IPv6 address formats?",
          options: [
            "IPv4 is 32-bit (numeric); IPv6 is 128-bit (hexadecimal).",
            "IPv4 uses colons; IPv6 uses dots.",
            "IPv4 is faster than IPv6.",
            "IPv4 is secure, IPv6 is not."
          ],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "What is the function of the NAT (Network Address Translation) protocol?",
          options: [
            "To translate IP addresses to domain names.",
            "To map multiple private IP addresses inside a local network to a single public IP address for internet traffic.",
            "To encrypt connection packets.",
            "To balance client request traffic."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In networks, what is latency?",
          options: [
            "The number of packets transferred per second.",
            "The time delay for a data packet to travel from source to destination.",
            "The size of the router queue.",
            "The network bandwidth capacity."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which layer of the OSI model handles routing, logical addressing, and path determination?",
          options: ["Physical Layer", "Data Link Layer", "Network Layer (Layer 3)", "Transport Layer (Layer 4)"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the purpose of the Subnet Mask?",
          options: [
            "To hide the IP address from servers.",
            "To distinguish the network portion of the IP address from the host portion.",
            "To encrypt local traffic.",
            "To translate network queries."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Operating Systems": [
        {
          question: "What is virtual memory in Operating Systems?",
          options: [
            "Temporary memory allocated to virtual machines.",
            "A memory management technique that extends physical RAM by using secondary storage disk space, presenting a larger address space to processes.",
            "RAM memory stored in cloud servers.",
            "Cache memory lines."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which state describes a process that is waiting for an I/O event to complete?",
          options: ["Running State", "Ready State", "Blocked / Waiting State", "Terminated State"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is a deadlock in process execution?",
          options: [
            "A process runs in an infinite loop.",
            "A state where two or more processes are unable to proceed because each is waiting for a resource held by another.",
            "The system crashes on resource limits.",
            "The CPU fan stops running."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the primary role of the CPU scheduler?",
          options: [
            "To allocate RAM memory blocks.",
            "To select processes from the ready queue and allocate CPU execution time slices to them.",
            "To backup folders.",
            "To manage files on disk."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In OS, what is a system call?",
          options: [
            "A telephone request to support.",
            "The programmatic interface that allows a user program to request services from the operating system kernel.",
            "An API call to database files.",
            "A hardware interrupt trace."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between a process and a thread?",
          options: [
            "A process is synchronous; a thread is asynchronous.",
            "A process is an executing program with independent memory; a thread is a subset of a process sharing its memory space.",
            "A process can only run on single core; threads run on multi core.",
            "A process runs in user space; threads in kernel."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is thrashing in virtual memory systems?",
          options: [
            "Deleting old files from disk.",
            "A state of excessive paging activity where the system spends more time swapping pages in and out than executing instructions.",
            "A CPU cache collision.",
            "A hardware diagnostics process."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which page replacement algorithm suffers from Belady's Anomaly?",
          options: ["Least Recently Used (LRU)", "Optimal Replacement", "First-In First-Out (FIFO)", "Least Frequently Used (LFU)"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is a semaphore used for in concurrent programming?",
          options: [
            "To define compile constants.",
            "To synchronize concurrent processes and manage access to shared resources to prevent race conditions.",
            "To allocate array space.",
            "To encrypt file data."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is context switching?",
          options: [
            "Changing code context in editors.",
            "The process of saving the state of a current CPU process and loading the state of a new process to resume execution.",
            "Swapping database connections.",
            "Alternating network channels."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Digital Electronics": [
        {
          question: "Which logic gate outputs 1 only if all its input pins are 0?",
          options: ["AND Gate", "OR Gate", "NAND Gate", "NOR Gate"],
          correctAnswer: 3,
          points: 10
        },
        {
          question: "What is a multiplexer (MUX)?",
          options: [
            "A circuit that multiplies binary numbers.",
            "A combinational circuit that selects one of many inputs and routes it to a single output line.",
            "A memory storage latch.",
            "An analog amplifier."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "In sequential circuits, what is the primary difference between a latch and a flip-flop?",
          options: [
            "Latches are faster than flip-flops.",
            "Latches are level-triggered (state changes with input level); flip-flops are edge-triggered (state changes with clock transition).",
            "Latches store multiple bits; flip-flops store one.",
            "Flip-flops do not use gates."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is Boolean Algebra simplification primarily used for?",
          options: [
            "To write math books.",
            "To reduce the number of logic gates and components required to implement a digital circuit.",
            "To increase clock speed.",
            "To calculate binary logs."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which flip-flop does not have an invalid or indeterminate state?",
          options: ["SR Flip-Flop", "JK Flip-Flop", "D Flip-Flop", "T Flip-Flop"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is a Karnaugh Map (K-map) used for?",
          options: [
            "To display motherboard paths.",
            "To simplify boolean algebraic expressions visually and find minimal sum-of-products or product-of-sums forms.",
            "To calculate CPU heat limits.",
            "To design database schemas."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "How many selection lines are required for a 1-to-8 demultiplexer?",
          options: ["1", "2", "3", "8"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is the binary representation of decimal 27?",
          options: ["10111", "11011", "11101", "11001"],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "Which code is also known as unit-distance code where consecutive values differ by only one bit?",
          options: ["BCD Code", "ASCII Code", "Gray Code", "Excess-3 Code"],
          correctAnswer: 2,
          points: 10
        },
        {
          question: "What is a decoder in digital circuits?",
          options: [
            "A system that translates encoded files.",
            "A combinational circuit that converts n input lines to a maximum of 2^n unique output lines.",
            "An analog signal mixer.",
            "A logic gate compiler."
          ],
          correctAnswer: 1,
          points: 10
        }
      ],
      "Signal Processing": [
        {
          question: "What does the Nyquist-Shannon Sampling Theorem state?",
          options: [
            "Signals must be sampled at a rate equal to the maximum frequency.",
            "To reconstruct a continuous bandlimited signal, the sampling frequency must be greater than twice the highest frequency component of the signal.",
            "Digital signals have no noise limit.",
            "Sampling duration must exceed 1 second."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the function of the Fast Fourier Transform (FFT)?",
          options: [
            "To compress audio file volumes.",
            "To convert a signal from the time domain to the frequency domain efficiently.",
            "To filter high frequency noise using analog components.",
            "To generate static noise."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the difference between an analog signal and a digital signal?",
          options: [
            "Analog signals are secure; digital signals are not.",
            "Analog signals are continuous in time and value; digital signals are discrete in both time and amplitude.",
            "Digital signals do not support frequencies.",
            "Analog signals require memory chips."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is a low-pass filter?",
          options: [
            "A filter that passes low frequencies and attenuates high frequencies.",
            "A filter that blocks low volume audios.",
            "A filter that allows only low voltage lines.",
            "A filter that speeds up signals."
          ],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "In signal processing, what is quantization?",
          options: [
            "Measuring signal speed.",
            "The process of mapping continuous infinite values to a smaller set of discrete finite values.",
            "Filtering noise signals.",
            "Multiplexing audio channels."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the term 'aliasing' refer to in digital signals?",
          options: [
            "Using variable naming aliases in code.",
            "An effect that causes different signals to become indistinguishable (overlapping) when sampled below the Nyquist rate.",
            "Noise generated by speakers.",
            "Signal compression loss."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does LTI system stand for in signal analysis?",
          options: [
            "Low Tolerance Interface system",
            "Linear Time-Invariant system",
            "Logic Transition Integration system",
            "Local Traffic Information system"
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What is the primary role of the Z-transform in discrete-time signal processing?",
          options: [
            "To encrypt audio recordings.",
            "To analyze discrete-time systems and signals in the complex frequency domain (similar to Laplace transform).",
            "To compress images.",
            "To convert analog waves."
          ],
          correctAnswer: 1,
          points: 10
        },
        {
          question: "What does the signal-to-noise ratio (SNR) measure?",
          options: [
            "The ratio of desired signal power to the power of background noise.",
            "The speed of signal transfer.",
            "The width of signal frequencies.",
            "The volume of output speakers."
          ],
          correctAnswer: 0,
          points: 10
        },
        {
          question: "What is a bandpass filter?",
          options: [
            "A filter that passes frequencies within a certain range and attenuates frequencies outside that range.",
            "A filter that only passes music files.",
            "A filter that amplifies all waves.",
            "A filter that balances stereo outputs."
          ],
          correctAnswer: 0,
          points: 10
        }
      ]
    };

    // Seed quizzes for all 17 subjects
    console.log("  Seeding quizzes for all subjects...");
    for (const teacher of teachers) {
      const subj = teacher.subject;
      const quizQuestions = SUBJECT_QUIZZES[subj];
      if (quizQuestions) {
        // Difficulty-neutral title
        const title = `${subj} Preparation Quiz`;
        const exists = await QuizModel.findOne({ title });
        if (!exists) {
          await QuizModel.create({
            teacherId: teacher.id,
            title,
            subject: subj,
            questions: JSON.stringify(quizQuestions),
            duration: 45,
            isActive: true,
          });
          console.log(`    ✅ Added quiz for subject: ${subj}`);
        }
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

if (process.argv[1] && (process.argv[1].includes("seed.ts") || process.argv[1].includes("seed.js"))) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
