import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

// Define schemas inline based on your provided schemas
const reviewComponentSchema = new mongoose.Schema(
  {
    marks: {
      type: Map,
      of: Number,
      default: {},
    },
    comments: { type: String, default: "" },
    attendance: {
      value: { type: Boolean, default: false },
      locked: { type: Boolean, default: false },
    },
    locked: { type: Boolean, default: false },
    pptApproved: {
      approved: { type: Boolean, default: false },
      locked: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema({
  regNo: String,
  name: String,
  emailId: String,
  reviews: {
    type: Map,
    of: reviewComponentSchema,
    default: {},
  },
  deadline: {
    type: Map,
    of: {
      from: { type: Date },
      to: { type: Date },
    },
    default: {},
  },
  PAT: {
    type: Boolean,
    default: false,
    required: true,
  },
  school: String,
  department: String,
});

const facultySchema = new mongoose.Schema({
  imageUrl: String,
  employeeId: String,
  name: String,
  emailId: String,
  phoneNumber: String,
  password: String,
  role: String,
  school: [String],
  department: [String],
  specialization: [String],
});

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  students: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
  ],
  guideFaculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Faculty",
    required: true,
  },
  panel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Panel",
    default: null,
  },
  school: { type: String, required: true },
  department: { type: String, required: true },
  specialization: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ["hardware", "software"],
  },
  bestProject: {
    type: Boolean,
    default: false,
  },
});

const Student = mongoose.model("Student", studentSchema);
const Faculty = mongoose.model("Faculty", facultySchema);
const Project = mongoose.model("Project", projectSchema);

const MONGO_URI = process.env.MONGOOSE_CONNECTION_STRING;

async function getProjectsWithReview0PPTNotApproved() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Find all projects and populate both students and guideFaculty
    const projects = await Project.find({})
      .populate({
        path: "students",
        select: "regNo name emailId reviews school department",
      })
      .populate({
        path: "guideFaculty",
        select:
          "employeeId name emailId phoneNumber school department specialization",
      })
      .lean();

    console.log(`📊 Found ${projects.length} total projects`);

    // Filter projects where at least one student has review0 pptApproved.approved === false
    const filtered = projects
      .map((project) => {
        const matchingStudents = (project.students || []).filter((student) => {
          // Check if student has review0 in their reviews Map
          if (student.reviews && student.reviews.review0) {
            const review0 = student.reviews.review0;
            // Check if pptApproved exists and approved is false
            if (review0.pptApproved && review0.pptApproved.approved === false) {
              return true;
            }
          }
          return false;
        });

        if (matchingStudents.length > 0) {
          return {
            projectId: project._id,
            projectName: project.name,
            school: project.school,
            department: project.department,
            specialization: project.specialization,
            type: project.type,
            guideFaculty: project.guideFaculty,
            matchingStudents,
            totalStudents: project.students.length,
          };
        }
        return null;
      })
      .filter((project) => project !== null);

    console.log(
      "\n==== Projects with review0.pptApproved.approved === false ===="
    );

    if (filtered.length === 0) {
      console.log("No projects found with review0 PPT not approved.");

      // Debug: Check what review data exists
      console.log("\n==== Debugging: Sample student review data ====");
      const sampleStudents = await Student.find({}).limit(3).lean();
      sampleStudents.forEach((student, idx) => {
        console.log(`\nStudent ${idx + 1}: ${student.name} (${student.regNo})`);
        console.log("Reviews:", Object.keys(student.reviews || {}));
        if (student.reviews && student.reviews.review0) {
          console.log(
            "Review0 PPT Approved:",
            student.reviews.review0.pptApproved
          );
        } else {
          console.log("No review0 found");
        }
      });
    } else {
      filtered.forEach((proj, index) => {
        console.log(`\n[${index + 1}] Project: ${proj.projectName}`);
        console.log(`    Project ID: ${proj.projectId}`);
        console.log(`    School: ${proj.school}`);
        console.log(`    Department: ${proj.department}`);
        console.log(`    Specialization: ${proj.specialization}`);
        console.log(`    Type: ${proj.type}`);
        console.log(`    Total Students: ${proj.totalStudents}`);

        // Guide Faculty Details
        console.log(`\n    📋 GUIDE FACULTY DETAILS:`);
        if (proj.guideFaculty) {
          console.log(`        Employee ID: ${proj.guideFaculty.employeeId}`);
          console.log(`        Name: ${proj.guideFaculty.name}`);
          console.log(`        Email: ${proj.guideFaculty.emailId}`);
          console.log(`        Phone: ${proj.guideFaculty.phoneNumber}`);
          console.log(
            `        School: ${proj.guideFaculty.school?.join(", ") || "N/A"}`
          );
          console.log(
            `        Department: ${
              proj.guideFaculty.department?.join(", ") || "N/A"
            }`
          );
          console.log(
            `        Specialization: ${
              proj.guideFaculty.specialization?.join(", ") || "N/A"
            }`
          );
        } else {
          console.log(`        No guide faculty found`);
        }

        // Students with review0 PPT not approved
        console.log(
          `\n    👥 STUDENTS WITH REVIEW0 PPT NOT APPROVED (${proj.matchingStudents.length}):`
        );
        proj.matchingStudents.forEach((student, idx) => {
          console.log(
            `        [${idx + 1}] ${student.name} (${student.regNo})`
          );
          console.log(`             Email: ${student.emailId}`);
          console.log(`             School: ${student.school}`);
          console.log(`             Department: ${student.department}`);
          if (student.reviews && student.reviews.review0) {
            console.log(
              `             Review0 PPT Status: ${
                student.reviews.review0.pptApproved?.approved
                  ? "Approved"
                  : "Not Approved"
              }`
            );
            console.log(
              `             Review0 PPT Locked: ${
                student.reviews.review0.pptApproved?.locked ? "Yes" : "No"
              }`
            );
          }
        });

        console.log(`\n${"=".repeat(80)}`);
      });

      console.log(`\n📊 SUMMARY:`);
      console.log(
        `Total projects with review0 PPT not approved: ${filtered.length}`
      );
      console.log(
        `Total students affected: ${filtered.reduce(
          (sum, proj) => sum + proj.matchingStudents.length,
          0
        )}`
      );
    }

    // Alternative aggregation approach for verification
    console.log("\n==== Alternative verification using aggregation ====");
    const aggregationResult = await Student.aggregate([
      {
        $match: {
          "reviews.review0.pptApproved.approved": false,
        },
      },
      {
        $project: {
          regNo: 1,
          name: 1,
          emailId: 1,
          school: 1,
          department: 1,
          "reviews.review0.pptApproved": 1,
        },
      },
    ]);

    console.log(
      `Found ${aggregationResult.length} students with review0 PPT not approved via aggregation:`
    );
    aggregationResult.forEach((student, idx) => {
      console.log(
        `  [${idx + 1}] ${student.name} (${student.regNo}) - ${student.school}`
      );
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

getProjectsWithReview0PPTNotApproved();
