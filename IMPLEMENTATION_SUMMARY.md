# Course Recommendation Accept/Decline Feature - Implementation Summary

## Overview
This document summarizes the implementation of the course recommendation accept/decline feature for the PCU Admission Portal. This feature allows applicants to view course recommendations from the admissions team and either accept or decline them.

## Changes Made

### 1. Database Schema (Migration Script)
**File**: `/scripts/migration_add_recommendation_response.sql`

Added two new columns to the `applicants` table:
- `recommended_course_response` (ENUM: 'pending', 'accepted', 'declined') - Tracks the applicant's response to a recommendation
- `accepted_recommended_program_id` (INT, FK to programs) - References the program the applicant accepted when responding to a recommendation

### 2. Backend API Endpoints
**File**: `/backend/routes/applicant.py`

Added two new endpoints:

#### GET `/applicant/get-recommendations`
- **Purpose**: Retrieve all recommended courses for the authenticated applicant
- **Auth**: Requires token
- **Returns**: List of recommendations with program details, reviewer info, and current response status

#### POST `/applicant/respond-to-recommendation`
- **Purpose**: Accept or decline a recommended course
- **Auth**: Requires token
- **Request Body**:
  - `review_id` (int): ID of the application review with the recommendation
  - `response` (string): 'accepted' or 'declined'
- **Behavior**:
  - When accepted: Updates the applicant's program_id to the recommended program
  - When declined: Records the decline response
- **Returns**: Confirmation of the response

### 3. Frontend API Client
**File**: `/lib/api.ts`

Added new types and methods:

#### Types:
- `Recommendation` - Represents a single recommendation
- `RecommendationResponse` - Response from get-recommendations endpoint

#### Methods:
- `getRecommendations()` - Fetch all recommendations for the applicant
- `respondToRecommendation(review_id, response)` - Submit accept/decline response

Also updated `ApplicantStatus` interface to include:
- `recommended_course_response` - Current response status
- `accepted_recommended_program_id` - ID of accepted program

### 4. Frontend UI Component
**File**: `/components/RecommendationCard.tsx`

Created a new component to display individual recommendations with:
- Program name and recommender info
- Recommendation notes from the reviewer
- Current response status with visual badges
- Accept/Decline buttons when pending
- Response confirmation when already responded

### 5. Applicant Dashboard Integration
**File**: `/app/applicant/dashboard/page.tsx`

Integrated recommendations feature:
- Added state management for recommendations and loading states
- Added `loadRecommendations()` function to fetch recommendations on dashboard load
- Added `handleRespondToRecommendation()` handler to process user responses
- Added "Course Recommendations" section that displays when recommendations exist
- Included error handling for failed recommendation loads
- Dashboard refreshes status after applicant responds to ensure UI reflects program change

## User Flow

1. **Admin Recommends Course**: Admin reviews application and selects "recommend_other_program" option, specifying the recommended program
2. **Applicant Views Dashboard**: Applicant logs in and sees a new "Course Recommendations" section if they have pending recommendations
3. **View Recommendation**: Applicant can view the recommendation details including notes from the reviewer
4. **Accept or Decline**: Applicant clicks either "Accept" or "Decline" button
5. **Response Recorded**: System records the response and:
   - If accepted: Updates applicant's program to the recommended program
   - If declined: Records the decline but keeps original program
6. **Dashboard Updates**: The recommendation card updates to show the response status

## Database Requirements

Run the migration script before deploying:
```sql
-- Execute migration_add_recommendation_response.sql
```

This adds the necessary columns to track recommendation responses.

## Testing Checklist

- [ ] Database tables created with new columns
- [ ] Admin can recommend an alternative program to an applicant
- [ ] Applicant can view recommendations in dashboard
- [ ] Applicant can accept a recommendation (program updates)
- [ ] Applicant can decline a recommendation (program unchanged)
- [ ] Recommendation status updates correctly in UI
- [ ] Multiple recommendations display correctly
- [ ] Error handling works for failed API calls
- [ ] Authorization checks prevent unauthorized access

## API Response Examples

### Get Recommendations (Success)
```json
{
  "recommendations": [
    {
      "review_id": 1,
      "program_id": 2,
      "program_name": "Computer Science",
      "review_notes": "Strong technical background, would excel in CS",
      "reviewed_by": "Dr. Smith",
      "reviewed_at": "2025-02-20T10:30:00",
      "response": null,
      "is_accepted": null
    }
  ],
  "total_recommendations": 1
}
```

### Respond to Recommendation (Success)
```json
{
  "message": "Recommendation accepted successfully",
  "applicant_id": 5,
  "response": "accepted"
}
```

## Notes

- The feature respects existing access controls and requires authentication
- Applicants can only view/respond to their own recommendations
- When a recommendation is accepted, the applicant's program is automatically updated
- The dashboard automatically refreshes to show updated program and status information
