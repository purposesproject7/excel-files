const axios = require('axios');
const XLSX = require('xlsx');

// Configuration
const API_BASE_URL = 'http://localhost:5000';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4Zjg5N2JlMjJiN2QwODQ3NDRmNjU0OCIsImVtYWlsSWQiOiJhZG1pbkB2aXQuYWMuaW4iLCJlbXBsb3llZUlkIjoiQURNSU4wMDEiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NjE3MTU4ODIsImV4cCI6MTc2MTgwMjI4Mn0.SDwiwhC6p8mEMwpCx9F5ZplpjZEZGcP-9IvhX7_Ez9A';
const EXCEL_FILE_PATH = '/home/administrator/Desktop/excel-files/internship-up.xlsx';

// Function to read Excel and extract registration numbers
function extractRegNumbers(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // First sheet 'Students'
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    const regNumbers = new Set();
    
    data.forEach(row => {
      // Add " (INTERNSHIP)" suffix in UPPERCASE to each registration number
      if (row['Student RegNo 1']) {
        regNumbers.add(`${row['Student RegNo 1']} (INTERNSHIP)`);
      }
      if (row['Student RegNo 2']) {
        regNumbers.add(`${row['Student RegNo 2']} (INTERNSHIP)`);
      }
      if (row['Student RegNo 3']) {
        regNumbers.add(`${row['Student RegNo 3']} (INTERNSHIP)`);
      }
    });
    
    return Array.from(regNumbers).filter(reg => reg);
  } catch (error) {
    console.error('❌ Error reading Excel file:', error.message);
    throw error;
  }
}

// Function to update PPT approval for a single student
async function updateStudentPPTApproval(regNo, token) {
  try {
    const encodedRegNo = encodeURIComponent(regNo);
    const url = `${API_BASE_URL}/api/student/${encodedRegNo}`;
    
    const updateData = {
      marksUpdate: [
        {
          reviewName: 'review0',
          pptApproved: {
            approved: true,
            locked: false
          }
        }
      ]
    };
    
    console.log(`📝 Updating ${regNo}...`);
    
    const response = await axios.put(url, updateData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      console.log(`✅ Successfully updated ${regNo}`);
      return { regNo, status: 'success', message: response.data.message };
    } else {
      console.log(`⚠️  Update failed for ${regNo}: ${response.data.message}`);
      return { regNo, status: 'failed', message: response.data.message };
    }
  } catch (error) {
    console.error(`❌ Error updating ${regNo}:`, error.response?.data?.message || error.message);
    return { 
      regNo, 
      status: 'error', 
      message: error.response?.data?.message || error.message 
    };
  }
}

// Function to update all students with delay
async function updateAllStudents(regNumbers, token, delayMs = 100) {
  const results = {
    total: regNumbers.length,
    successful: [],
    failed: [],
    errors: []
  };
  
  console.log(`\n🚀 Starting bulk update for ${regNumbers.length} students...\n`);
  
  for (let i = 0; i < regNumbers.length; i++) {
    const regNo = regNumbers[i];
    const result = await updateStudentPPTApproval(regNo, token);
    
    if (result.status === 'success') {
      results.successful.push(result);
    } else if (result.status === 'failed') {
      results.failed.push(result);
    } else {
      results.errors.push(result);
    }
    
    if (i < regNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    if ((i + 1) % 10 === 0 || i === regNumbers.length - 1) {
      console.log(`\n📊 Progress: ${i + 1}/${regNumbers.length} students processed\n`);
    }
  }
  
  return results;
}

// Function to display summary
function displaySummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 UPDATE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Students: ${results.total}`);
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`⚠️  Failed: ${results.failed.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);
  console.log('='.repeat(60));
  
  if (results.failed.length > 0) {
    console.log('\n⚠️  Failed Updates:');
    results.failed.forEach(item => {
      console.log(`  - ${item.regNo}: ${item.message}`);
    });
  }
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(item => {
      console.log(`  - ${item.regNo}: ${item.message}`);
    });
  }
  
  console.log('\n');
}

// Main execution function
async function main() {
  try {
    console.log('🔧 Starting PPT Approval Bulk Update Script...\n');
    
    console.log('📖 Reading Excel file...');
    const regNumbers = extractRegNumbers(EXCEL_FILE_PATH);
    console.log(`✅ Found ${regNumbers.length} unique registration numbers\n`);
    
    // Display first 5 registration numbers for verification
    console.log('📋 Sample Registration Numbers:');
    regNumbers.slice(0, 5).forEach(reg => console.log(`  - ${reg}`));
    console.log('');
    
    if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
      console.error('❌ Error: Please set a valid JWT token in the script');
      process.exit(1);
    }
    
    const results = await updateAllStudents(regNumbers, JWT_TOKEN);
    displaySummary(results);
    
    const fs = require('fs');
    const resultFile = `update-results-${Date.now()}.json`;
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    console.log(`💾 Results saved to: ${resultFile}\n`);
    
    console.log('✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
