#!/usr/bin/env python3
"""
Student Review Updater - FINAL PRODUCTION VERSION
Processes ALL students with component-level marks
Only skips dummy reviews, processes everyone else including absent students
"""

import pandas as pd
import requests
import json
from datetime import datetime
import logging
from typing import Dict, List, Optional, Tuple
import sys
import os

# Configure logging
log_filename = f'update_log_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class StudentReviewUpdater:
    """Handles updating student review marks with component-level detail"""
    
    def __init__(self, excel_file_path: str, api_endpoint_url: str, dry_run: bool = False):
        self.excel_file_path = excel_file_path
        self.api_endpoint_url = api_endpoint_url
        self.dry_run = dry_run
        
        # Exact component mapping matching Excel columns
        self.component_mapping = {
            'MCA': {
                'draftReview': {
                    'excel_prefix': 'Zero-th Review',
                    'components': ['Problem Formulation'],
                    'is_dummy': False
                },
                'guideReview1': {
                    'excel_prefix': 'Review 1',
                    'components': ['Literature Review & Design of Methodology'],
                    'is_dummy': False
                },
                'guideReview2': {
                    'excel_prefix': 'Dummy',
                    'components': ['test'],
                    'is_dummy': True  # Skip this
                },
                'review0': {
                    'excel_prefix': 'Review 2',
                    'components': [
                        'Proposed Model / Architecture / Framework Designed',
                        'Modules Description',
                        'Detailed design with Explanations (Algorithms)',
                        'Partial Implementation (60%)/Dataset description / Results Obtained',
                        'Presentation & Ability to Answer questions'
                    ],
                    'is_dummy': False
                }
            },
            'BTech': {
                'draftReview': {
                    'excel_prefix': 'Zero-th Review',
                    'components': ['Title & Problem Statement'],
                    'is_dummy': False
                },
                'panelReview1': {
                    'excel_prefix': 'Review 1',
                    'components': [
                        'Problem Statement & Motivation',
                        'Literature Review & Gap Identification',
                        'Objective & Scope',
                        'Proposed methodology & Feasability',
                        'Presentation & Communication'
                    ],
                    'is_dummy': False
                },
                'guideReview1': {
                    'excel_prefix': 'Dummy ',  # Note the space
                    'components': ['test'],
                    'is_dummy': True  # Skip this
                }
            },
            'M.Tech 2yrs (MCB, MCS,': {
                'draftReview': {
                    'excel_prefix': 'Dummy',
                    'components': ['test'],
                    'is_dummy': True  # Skip this
                },
                'panelReview1': {
                    'excel_prefix': '2nd Review',
                    'components': [
                        'Explanation of all the modules one by one which includes the algorithm(s)',
                        '70% implementation with results',
                        'Presentation skill and ability to answer questions'
                    ],
                    'is_dummy': False
                }
            }
        }
        
        # Sheet name to department mapping
        self.sheet_to_department = {
            'SCOPE_MCA_1': 'MCA',
            'SCOPE_BTech_2': 'BTech',
            'SCOPE_M.Tech 2yrs (MCB, MCS, _3': 'M.Tech 2yrs (MCB, MCS,'
        }
        
        self.failed_updates = []
        self.successful_updates = []
        self.total_students_processed = 0
        self.total_reviews_skipped = 0
        
    def load_excel_data(self) -> bool:
        """Load all sheets from Excel file"""
        try:
            excel_file = pd.ExcelFile(self.excel_file_path)
            self.sheet_data = {}
            
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
                # Clean column names
                df.columns = df.columns.str.strip()
                self.sheet_data[sheet_name] = df
                logger.info(f"✅ Loaded sheet '{sheet_name}' with {len(df)} students")
                
            return True
        except Exception as e:
            logger.error(f"❌ Failed to load Excel file: {str(e)}")
            return False
    
    def extract_component_marks(self, row: pd.Series, review_config: Dict, 
                                excel_prefix: str) -> Dict[str, float]:
        """Extract component marks from Excel row"""
        component_marks = {}
        
        for component_name in review_config['components']:
            col_name = f"{excel_prefix}_{component_name}"
            
            # Try to get the mark
            if col_name in row.index:
                if pd.notna(row[col_name]):
                    try:
                        mark = float(row[col_name])
                        # Include all marks, even zeros
                        component_marks[component_name] = mark
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid mark value for {col_name}: {row[col_name]}")
                else:
                    # Column exists but value is NaN - leave it out
                    pass
            else:
                logger.debug(f"Column not found: {col_name}")
                    
        return component_marks
    
    def process_student_row(self, row: pd.Series, department: str) -> Optional[Dict]:
        """Process a single student row and extract review data"""
        
        # Get student identification
        try:
            reg_no = str(row['Register No']).strip()
            student_name = str(row['Name']).strip()
        except KeyError as e:
            logger.error(f"❌ Missing required column: {e}")
            return None
        
        # Skip rows without valid registration number
        if not reg_no or reg_no in ['nan', '', 'None']:
            logger.warning(f"⚠️  Skipping row: No valid registration number (Name: {student_name})")
            return None
        
        logger.info(f"📝 Processing: {student_name} ({reg_no})")
        
        # Get PAT status
        pat_detected = False
        if 'PAT_Detected' in row.index and pd.notna(row['PAT_Detected']):
            pat_detected = str(row['PAT_Detected']).lower() in ['yes', 'true', '1']
        
        # Get department mapping
        dept_mapping = self.component_mapping.get(department)
        if not dept_mapping:
            logger.error(f"❌ No mapping found for department: {department}")
            return None
        
        # Extract reviews data - PROCESS ALL NON-DUMMY REVIEWS
        reviews_data = {}
        
        for review_name, review_config in dept_mapping.items():
            # Skip ONLY dummy reviews
            if review_config.get('is_dummy', False):
                logger.debug(f"⏭️  Skipping dummy review: {review_name}")
                self.total_reviews_skipped += 1
                continue
            
            excel_prefix = review_config['excel_prefix']
            
            # Extract component marks
            component_marks = self.extract_component_marks(row, review_config, excel_prefix)
            
            # Get comments and attendance
            comments_col = f"{excel_prefix}_Comments"
            attendance_col = f"{excel_prefix}_Attendance"
            
            comments = ""
            if comments_col in row.index and pd.notna(row[comments_col]):
                comments = str(row[comments_col]).strip()
            
            attendance_present = False
            if attendance_col in row.index and pd.notna(row[attendance_col]):
                attendance_val = str(row[attendance_col]).lower()
                attendance_present = attendance_val == 'present'
            
            # ALWAYS ADD REVIEW DATA (even if empty)
            # Empty data is valid - means no marks entered yet or student absent
            reviews_data[review_name] = {
                "marks": component_marks,  # Can be empty dict
                "comments": comments,
                "attendance": {
                    "value": attendance_present,
                    "locked": False
                },
                "locked": False
            }
            
            marks_sum = sum(component_marks.values()) if component_marks else 0
            status = "Present" if attendance_present else "Absent"
            comp_count = len(component_marks)
            logger.info(f"  ✓ {review_name}: {comp_count} components, Marks: {marks_sum}, Status: {status}")
        
        # ALWAYS RETURN student data
        return {
            "studentId": reg_no,
            "reviews": reviews_data,
            "PAT": pat_detected
        }
    
    def create_api_payload(self, student_updates: List[Dict], 
                          project_id: str = "unknown") -> Dict:
        """Create the API payload structure"""
        return {
            "projectId": project_id,
            "projectUpdates": {},
            "studentUpdates": student_updates,
            "pptApproved": False
        }
    
    def send_update_request(self, payload: Dict) -> Tuple[bool, str]:
        """Send update request to API"""
        if self.dry_run:
            logger.info(f"[DRY RUN] Would send: {len(payload['studentUpdates'])} students")
            return True, {"message": "Dry run - no actual API call"}
        
        try:
            response = requests.post(
                self.api_endpoint_url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=60
            )
            
            if response.status_code == 200:
                return True, response.json()
            else:
                error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                return False, error_msg
                
        except requests.exceptions.Timeout:
            return False, "Request timeout (>60s)"
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}"
    
    def process_sheet(self, sheet_name: str, df: pd.DataFrame) -> int:
        """Process a single sheet and update students"""
        
        if sheet_name not in self.sheet_to_department:
            logger.warning(f"⚠️  Unknown sheet: {sheet_name}, skipping")
            return 0
        
        department = self.sheet_to_department[sheet_name]
        logger.info(f"\n{'='*80}")
        logger.info(f"📋 Processing Sheet: {sheet_name}")
        logger.info(f"🏫 Department: {department}")
        logger.info(f"👥 Total Students: {len(df)}")
        logger.info(f"{'='*80}")
        
        # Process students in batches
        batch_size = 10
        student_updates = []
        processed_count = 0
        
        for index, row in df.iterrows():
            try:
                student_data = self.process_student_row(row, department)
                
                if student_data:
                    student_updates.append(student_data)
                    processed_count += 1
                    
                # Send batch when batch_size is reached
                if len(student_updates) >= batch_size:
                    self.send_batch_update(student_updates, sheet_name)
                    student_updates = []
                    
            except Exception as e:
                reg_no = row.get('Register No', 'Unknown')
                name = row.get('Name', 'Unknown')
                error_msg = f"Failed to process {name} ({reg_no}): {str(e)}"
                logger.error(f"❌ {error_msg}")
                logger.exception(e)  # Log full traceback
                self.failed_updates.append({
                    'sheet': sheet_name,
                    'reg_no': reg_no,
                    'name': name,
                    'error': str(e)
                })
        
        # Send remaining students
        if student_updates:
            self.send_batch_update(student_updates, sheet_name)
        
        logger.info(f"✅ Sheet '{sheet_name}' complete: {processed_count} students processed")
        return processed_count
    
    def send_batch_update(self, student_updates: List[Dict], sheet_name: str):
        """Send a batch of student updates"""
        if not student_updates:
            return
        
        logger.info(f"📤 Sending batch of {len(student_updates)} students...")
        
        # Log sample payload for debugging (first student)
        if student_updates:
            logger.debug(f"Sample payload: {json.dumps(student_updates[0], indent=2)}")
        
        payload = self.create_api_payload(student_updates)
        success, result = self.send_update_request(payload)
        
        if success:
            logger.info(f"✅ Batch successful: {len(student_updates)} students updated")
            self.successful_updates.extend([{
                'sheet': sheet_name,
                'reg_no': s['studentId'],
                'reviews_count': len(s['reviews'])
            } for s in student_updates])
        else:
            error_msg = f"Batch failed: {result}"
            logger.error(f"❌ {error_msg}")
            for student in student_updates:
                self.failed_updates.append({
                    'sheet': sheet_name,
                    'reg_no': student['studentId'],
                    'error': error_msg
                })
    
    def process_all_sheets(self):
        """Process all sheets and update student reviews"""
        if not self.load_excel_data():
            return False
        
        self.total_students_processed = 0
        
        for sheet_name, df in self.sheet_data.items():
            processed = self.process_sheet(sheet_name, df)
            self.total_students_processed += processed
        
        logger.info(f"\n{'='*80}")
        logger.info(f"🎉 ALL SHEETS PROCESSED")
        logger.info(f"{'='*80}")
        logger.info(f"✅ Total Students Processed: {self.total_students_processed}")
        logger.info(f"✅ Successful Updates: {len(self.successful_updates)}")
        logger.info(f"❌ Failed Updates: {len(self.failed_updates)}")
        logger.info(f"⏭️  Dummy Reviews Skipped: {self.total_reviews_skipped}")
        
        return True
    
    def generate_report(self) -> Dict:
        """Generate a comprehensive summary report"""
        report = {
            "timestamp": datetime.now().isoformat(),
            "dry_run": self.dry_run,
            "summary": {
                "total_students_processed": self.total_students_processed,
                "total_successful": len(self.successful_updates),
                "total_failed": len(self.failed_updates),
                "total_reviews_skipped": self.total_reviews_skipped
            },
            "successful_updates": self.successful_updates,
            "failed_updates": self.failed_updates
        }
        
        # Save detailed report
        report_filename = f"update_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"\n📄 Detailed report saved: {report_filename}")
        
        # Print summary
        print("\n" + "="*80)
        print("📊 FINAL UPDATE SUMMARY")
        print("="*80)
        print(f"{'DRY RUN MODE' if self.dry_run else 'LIVE MODE'}")
        print(f"✅ Students Processed: {report['summary']['total_students_processed']}")
        print(f"✅ Successful Updates: {report['summary']['total_successful']}")
        print(f"❌ Failed Updates: {report['summary']['total_failed']}")
        print(f"⏭️  Dummy Reviews Skipped: {report['summary']['total_reviews_skipped']}")
        
        if self.failed_updates:
            print("\n❌ FAILED UPDATES:")
            print("-" * 80)
            for i, failure in enumerate(self.failed_updates[:10], 1):
                print(f"{i}. {failure.get('name', 'N/A')} ({failure['reg_no']})")
                print(f"   Error: {failure['error']}")
            if len(self.failed_updates) > 10:
                print(f"\n... and {len(self.failed_updates) - 10} more (see {report_filename})")
        
        print("\n" + "="*80)
        print("✅ ALL STUDENTS PROCESSED")
        print("   • Includes students with zero marks (valid)")
        print("   • Includes absent students (valid)")
        print("   • Includes students with only comments (valid)")
        print("   • Only dummy/test reviews were skipped")
        print("="*80)
        
        return report


def main():
    """Main execution function"""
    print("\n" + "="*80)
    print("🚀 STUDENT REVIEW UPDATER - FINAL PRODUCTION VERSION")
    print("="*80)
    print("✓ Processes ALL students including absent and zero-mark cases")
    print("✓ Component-level marks extraction")
    print("✓ Only skips dummy/test reviews")
    print("="*80)
    
    # Configuration
    EXCEL_FILE_PATH = "StudentManagement_ComponentSplit_AllReviews_2025-10-28-4.xlsx"
    API_ENDPOINT_URL = "http://localhost:3000/api/updateProjectDetails"
    
    # Check if file exists
    if not os.path.exists(EXCEL_FILE_PATH):
        print(f"\n❌ Error: Excel file not found: {EXCEL_FILE_PATH}")
        print(f"   Please ensure the file is in the same directory as this script.")
        return
    
    # Display configuration
    print(f"\n📁 Excel File: {EXCEL_FILE_PATH}")
    print(f"🌐 API Endpoint: {API_ENDPOINT_URL}")
    
    # Ask for dry run or live mode
    print("\n" + "-"*80)
    print("MODE SELECTION:")
    print("  1. DRY RUN - Test mode (no actual API calls)")
    print("  2. LIVE MODE - Update database (actual API calls)")
    print("-"*80)
    
    mode_choice = input("\nSelect mode (1 or 2): ").strip()
    dry_run = (mode_choice == '1')
    
    if dry_run:
        print("\n🔍 Running in DRY RUN mode (no database changes)")
    else:
        print("\n⚠️  Running in LIVE MODE (will update database)")
        confirm = input("\nType 'CONFIRM' to proceed: ").strip()
        if confirm != 'CONFIRM':
            print("❌ Operation cancelled")
            return
    
    # Create updater instance
    updater = StudentReviewUpdater(EXCEL_FILE_PATH, API_ENDPOINT_URL, dry_run=dry_run)
    
    # Process all sheets
    print("\n🔄 Starting update process...\n")
    updater.process_all_sheets()
    
    # Generate report
    report = updater.generate_report()
    
    print(f"\n📄 Log file: {log_filename}")
    print(f"📄 Report file: update_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    print("\n✅ Process complete!\n")
    
    return report


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Process interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.exception("Fatal error:")
        print(f"\n❌ Fatal error: {str(e)}")
        sys.exit(1)
