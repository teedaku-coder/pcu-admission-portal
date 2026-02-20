-- Migration: Add recommendation response tracking to applicants table
-- Purpose: Allow applicants to accept or decline recommended courses

USE admission_portal;

-- Add column to track applicant's response to recommendation
ALTER TABLE applicants 
ADD COLUMN recommended_course_response ENUM('pending', 'accepted', 'declined') DEFAULT 'pending';

-- Add column to track which program the applicant accepted
ALTER TABLE applicants 
ADD COLUMN accepted_recommended_program_id INT,
ADD FOREIGN KEY (accepted_recommended_program_id) REFERENCES programs(id);

-- Create an index on recommendation response for faster queries
CREATE INDEX idx_recommended_course_response ON applicants(recommended_course_response);

-- Add comment documentation
ALTER TABLE applicants 
MODIFY recommended_course_response ENUM('pending', 'accepted', 'declined') DEFAULT 'pending' COMMENT 'Tracks applicants response to recommended course: pending (no response), accepted (accepted recommendation), declined (declined recommendation)';

ALTER TABLE applicants 
MODIFY accepted_recommended_program_id INT COMMENT 'Reference to the program the applicant accepted when responding to recommendation';
