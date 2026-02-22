from flask import Blueprint, request, jsonify, Response
from database import Database
from utils.auth import AuthHandler
from datetime import datetime
from email_utils import send_email
from utils.pdf_generator import PDFGenerator
from utils.letter_templates import get_template_by_id, get_all_templates

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/applications', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_applications(payload):
    """Get list of all applications with filtering options"""
    status = request.args.get('status', 'submitted')
    program_id = request.args.get('program_id')
    
    # Handle special 'pending_letters' status for accepted applicants without letters
    if status == 'pending_letters':
        query = '''SELECT a.id, a.user_id, u.name, u.email, u.phone_number, 
                          a.program_id, p.name as program_name, a.application_status,
                          a.admission_status, a.submitted_at
                   FROM applicants a
                   JOIN users u ON a.user_id = u.id
                   LEFT JOIN programs p ON a.program_id = p.id
                   WHERE a.application_status = %s AND a.admission_status = %s'''
        
        params = ['accepted', 'not_admitted']
        
        if program_id:
            query += ' AND a.program_id = %s'
            params.append(program_id)
        
        query += ' ORDER BY a.submitted_at DESC'
    else:
        query = '''SELECT a.id, a.user_id, u.name, u.email, u.phone_number, 
                          a.program_id, p.name as program_name, a.application_status,
                          a.admission_status, a.submitted_at
                   FROM applicants a
                   JOIN users u ON a.user_id = u.id
                   LEFT JOIN programs p ON a.program_id = p.id
                   WHERE a.application_status = %s'''
        
        params = [status]
        
        if program_id:
            query += ' AND a.program_id = %s'
            params.append(program_id)
        
        query += ' ORDER BY a.submitted_at DESC'
    
    applications = Database.execute_query(query, tuple(params))
    
    return jsonify({
        'count': len(applications) if applications else 0,
        'applications': applications or []
    }), 200

@admin_bp.route('/application/<int:applicant_id>', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_application_details(payload, applicant_id):
    """Get detailed application information"""
    
    # Get applicant details
    applicant = Database.execute_query(
        '''SELECT a.id, a.user_id, u.name, u.email, u.phone_number,
                  a.program_id, p.name as program_name, a.application_status,
                  a.admission_status, a.submitted_at
           FROM applicants a
           JOIN users u ON a.user_id = u.id
           LEFT JOIN programs p ON a.program_id = p.id
           WHERE a.id = %s''',
        (applicant_id,)
    )
    
    if not applicant:
        return jsonify({'message': 'Applicant not found'}), 404
    
    # Get application form
    form = Database.execute_query(
        'SELECT * FROM application_forms WHERE applicant_id = %s',
        (applicant_id,)
    )
    
    # Get documents
    documents = Database.execute_query(
        '''SELECT id, document_type, original_filename, file_size, compressed_size, is_compressed
           FROM documents d
           JOIN application_forms af ON d.application_form_id = af.id
           WHERE af.applicant_id = %s''',
        (applicant_id,)
    )
    
    # Get review history
    reviews = Database.execute_query(
        '''SELECT ar.id, ar.reviewed_by, u.name as reviewed_by_name, ar.review_notes,
                  ar.recommendation, ar.recommended_program_id, p.name as recommended_program,
                  ar.reviewed_at
           FROM application_reviews ar
           LEFT JOIN users u ON ar.reviewed_by = u.id
           LEFT JOIN programs p ON ar.recommended_program_id = p.id
           WHERE ar.applicant_id = %s
           ORDER BY ar.reviewed_at DESC''',
        (applicant_id,)
    )
    
    return jsonify({
        'applicant': applicant[0],
        'form': form[0] if form else None,
        'documents': documents or [],
        'reviews': reviews or []
    }), 200

@admin_bp.route('/review-application', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def review_application(payload, admin_id=None):
    """Review and approve/reject/recommend application"""
    admin_id = payload['user_id']
    data = request.get_json()
    
    if not data or 'applicant_id' not in data or 'recommendation' not in data:
        return jsonify({'message': 'applicant_id and recommendation are required'}), 400
    
    applicant_id = data['applicant_id']
    recommendation = data['recommendation']  # 'accept', 'reject', 'recommend_other_program'
    review_notes = data.get('review_notes', '')
    recommended_program_id = data.get('recommended_program_id')
    
    # Validate recommendation
    if recommendation not in ['accept', 'reject', 'recommend_other_program']:
        return jsonify({'message': 'Invalid recommendation'}), 400
    
    # Create review record
    review_id = Database.execute_update(
        '''INSERT INTO application_reviews 
           (applicant_id, reviewed_by, review_notes, recommendation, recommended_program_id)
           VALUES (%s, %s, %s, %s, %s)''',
        (applicant_id, admin_id, review_notes, recommendation, recommended_program_id if recommendation == 'recommend_other_program' else None)
    )
    
    if not review_id:
        return jsonify({'message': 'Failed to save review'}), 500
    
    # Update applicant status based on recommendation
    if recommendation == 'accept':
        new_status = 'accepted'
    elif recommendation == 'reject':
        new_status = 'rejected'
    else:
        new_status = 'recommended'
    
    Database.execute_update(
        'UPDATE applicants SET application_status = %s WHERE id = %s',
        (new_status, applicant_id)
    )
    
    return jsonify({
        'message': 'Application reviewed successfully',
        'review_id': review_id,
        'new_status': new_status
    }), 201

@admin_bp.route('/send-admission-letter', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def send_admission_letter(payload):
    """Send admission letter to single applicant using the selected template"""
    data = request.get_json()
    
    if not data or 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400
    
    applicant_id = data['applicant_id']
    # Get date in YYYY-MM-DD format from frontend or use today
    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    # Convert to display format for the letter (e.g., "15 February, 2026")
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_db
    template_id = data.get('template_id', 'default')  # Get template selection, default to 'default'
    
    # Generate reference number
    ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
    
    # Get applicant details with all program info
    applicant = Database.execute_query(
        '''SELECT u.id, u.name, u.email, a.program_id, 
           p.name as program_name, p.level, p.department, p.faculty, 
           p.mode, p.session, p.resumption_date
           FROM applicants a
           JOIN users u ON a.user_id = u.id
           LEFT JOIN programs p ON a.program_id = p.id
           WHERE a.id = %s AND a.application_status = %s''',
        (applicant_id, 'accepted')
    )
    
    if not applicant:
        return jsonify({'message': 'Applicant not found or application not accepted'}), 404
    
    applicant_data = applicant[0]
    
    # Look up program fees
    fees = Database.execute_query(
        'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
        (applicant_data['program_id'],)
    )
    acceptance_fee_str = ''
    tuition_fee_str = ''
    other_fees_str = ''
    if fees:
        acceptance_fee = fees[0]['acceptance_fee']
        tuition_fee = fees[0]['tuition_fee']
        other_fees = fees[0].get('other_fees', 0)
        acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
        tuition_fee_str = f"₦{tuition_fee:,.2f}"
        other_fees_str = f"₦{other_fees:,.2f}"
    
    # Generate PDF using the selected template
    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        applicant_name=applicant_data['name'],
        program=applicant_data['program_name'] or '',
        level=applicant_data.get('level') or '100 Level',
        department=applicant_data.get('department') or '',
        faculty=applicant_data.get('faculty') or '',
        session=applicant_data.get('session') or '2025/2026',
        mode=applicant_data.get('mode') or 'Full-Time',
        admission_date=admission_date_display,
        acceptance_fee=acceptance_fee_str,
        tuition_fee=tuition_fee_str,
        other_fees=other_fees_str,
        resumption_date=applicant_data.get('resumption_date') or '',
        reference=ref_no,
        body_html=''
    )
    
    # Update admission status
    Database.execute_update(
        'UPDATE applicants SET admission_status = %s WHERE id = %s',
        ('admitted', applicant_id)
    )
    
    # Send email with PDF attachment
    subject = 'Provisional Admission Letter'
    body_text = f"Dear {applicant_data['name']},\n\nPlease find attached your admission letter.\n\nBest regards,\nAdmissions Office"
    attachments = [('admission_letter.pdf', pdf_bytes)]
    
    email_sent = send_email(
        to_email=applicant_data['email'],
        subject=subject,
        body_text=body_text,
        attachments=attachments
    )
    
    return jsonify({
        'message': 'Admission letter sent successfully' if email_sent else 'Failed to send admission letter',
        'recipient_email': applicant_data['email'],
        'email_sent': email_sent
    }), 201 if email_sent else 500


@admin_bp.route(
    '/preview-admission-letter',
    methods=['POST', 'OPTIONS']
)
@AuthHandler.token_required
@AuthHandler.admin_required
def preview_admission_letter(payload):

    if request.method == 'OPTIONS':
        return '', 200
    
    """Generate and return admission letter PDF for preview (no DB save, no email)"""
    data = request.get_json() or {}
    if 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400

    applicant_id = data['applicant_id']

    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))

    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_db
    template_id = data.get('template_id', 'default')  # Get template selection, default to 'default'

    # Generate reference number
    ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"

    # Get applicant details with all program info
    applicant = Database.execute_query(
        '''SELECT u.id, u.name, u.email, a.program_id, p.name as program_name,
                  p.level, p.department, p.faculty, p.mode, p.session, p.resumption_date
           FROM applicants a
           JOIN users u ON a.user_id = u.id
           LEFT JOIN programs p ON a.program_id = p.id
           WHERE a.id = %s AND a.application_status = %s''',
        (applicant_id, 'accepted')
    )

    if not applicant:
        return jsonify({'message': 'Applicant not found or application not accepted'}), 404

    applicant_data = applicant[0]

    # Look up program fees
    fees = Database.execute_query(
        'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
        (applicant_data['program_id'],)
    )

    acceptance_fee_str = ''
    tuition_fee_str = ''
    other_fees_str = ''
    if fees:
        acceptance_fee = fees[0]['acceptance_fee']
        tuition_fee = fees[0]['tuition_fee']
        other_fees = fees[0].get('other_fees', 0)
        acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
        tuition_fee_str = f"₦{tuition_fee:,.2f}"
        other_fees_str = f"₦{other_fees:,.2f}"

    # Generate PDF using selected template (default to 'default' if not specified)
    pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
        applicant_name=applicant_data['name'],
        program=applicant_data['program_name'] or '',
        level=applicant_data.get('level') or '100 Level',
        department=applicant_data.get('department') or '',
        faculty=applicant_data.get('faculty') or '',
        session=applicant_data.get('session') or '2025/2026',
        mode=applicant_data.get('mode') or 'Full-Time',
        admission_date=admission_date_display,
        acceptance_fee=acceptance_fee_str,
        tuition_fee=tuition_fee_str,
        other_fees=other_fees_str,
        resumption_date=applicant_data.get('resumption_date') or '',
        reference=ref_no,
        body_html=''
    )

    # Return PDF as preview (no database save, no email)
    return Response(pdf_bytes, mimetype='application/pdf', headers={
        'Content-Disposition': 'inline; filename=admission_preview.pdf'
    })

@admin_bp.route('/send-batch-letters', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def send_batch_letters(payload):
    """Send admission letters to multiple applicants using the selected template"""
    data = request.get_json()
    
    if not data or 'applicant_ids' not in data:
        return jsonify({'message': 'applicant_ids is required'}), 400
    
    applicant_ids = data['applicant_ids']
    # Get date in YYYY-MM-DD format from frontend or use today
    admission_date_db = data.get('admission_date', datetime.now().strftime('%Y-%m-%d'))
    # Convert to display format for the letter (e.g., "15 February, 2026")
    try:
        date_obj = datetime.strptime(admission_date_db, '%Y-%m-%d')
        admission_date_display = date_obj.strftime('%d %B, %Y')
    except:
        admission_date_display = admission_date_db
    template_id = data.get('template_id', 'default')  # Get template selection, default to 'default'
    
    if not isinstance(applicant_ids, list) or len(applicant_ids) == 0:
        return jsonify({'message': 'applicant_ids must be a non-empty list'}), 400
    
    letters_created = []
    errors = []
    
    for applicant_id in applicant_ids:
        try:
            # Generate reference number
            ref_no = f"PCU/ADM/{datetime.now().strftime('%Y')}/{applicant_id:04d}"
            
            # Get applicant details with all program info
            applicant = Database.execute_query(
                '''SELECT u.id, u.name, u.email, a.program_id, 
                   p.name as program_name, p.level, p.department, p.faculty, 
                   p.mode, p.session, p.resumption_date
                   FROM applicants a
                   JOIN users u ON a.user_id = u.id
                   LEFT JOIN programs p ON a.program_id = p.id
                   WHERE a.id = %s AND a.application_status = %s''',
                (applicant_id, 'accepted')
            )
            
            if not applicant:
                errors.append({'applicant_id': applicant_id, 'error': 'Not found or not accepted'})
                continue
            
            applicant_data = applicant[0]
            
            # Look up program fees
            fees = Database.execute_query(
                'SELECT acceptance_fee, tuition_fee, other_fees FROM program_fees WHERE program_id = %s',
                (applicant_data['program_id'],)
            )
            acceptance_fee_str = ''
            tuition_fee_str = ''
            other_fees_str = ''
            if fees:
                acceptance_fee = fees[0]['acceptance_fee']
                tuition_fee = fees[0]['tuition_fee']
                other_fees = fees[0].get('other_fees', 0)
                acceptance_fee_str = f"₦{acceptance_fee:,.2f}"
                tuition_fee_str = f"₦{tuition_fee:,.2f}"
                other_fees_str = f"₦{other_fees:,.2f}"
            
            # Generate PDF using the selected template
            pdf_bytes = PDFGenerator.generate_admission_letter_pdf(
                applicant_name=applicant_data['name'],
                program=applicant_data['program_name'] or '',
                level=applicant_data.get('level') or '100 Level',
                department=applicant_data.get('department') or '',
                faculty=applicant_data.get('faculty') or '',
                session=applicant_data.get('session') or '2025/2026',
                mode=applicant_data.get('mode') or 'Full-Time',
                admission_date=admission_date_display,
                acceptance_fee=acceptance_fee_str,
                tuition_fee=tuition_fee_str,
                other_fees=other_fees_str,
                resumption_date=applicant_data.get('resumption_date') or '',
                reference=ref_no,
                body_html=''
            )
            
            # Update admission status
            Database.execute_update(
                'UPDATE applicants SET admission_status = %s WHERE id = %s',
                ('admitted', applicant_id)
            )
            letters_created.append({'applicant_id': applicant_id})
            
            # Send email with PDF attachment
            subject = 'Provisional Admission Letter'
            body_text = f"Dear {applicant_data['name']},\n\nPlease find attached your admission letter.\n\nBest regards,\nAdmissions Office"
            attachments = [('admission_letter.pdf', pdf_bytes)]
            
            email_ok = send_email(
                to_email=applicant_data['email'],
                subject=subject,
                body_text=body_text,
                attachments=attachments
            )
            if not email_ok:
                errors.append({'applicant_id': applicant_id, 'error': 'Email send failed'})
        
        except Exception as e:
            errors.append({'applicant_id': applicant_id, 'error': str(e)})
    
    return jsonify({
        'message': 'Batch letter generation completed',
        'total_requested': len(applicant_ids),
        'letters_created': len(letters_created),
        'errors': len(errors),
        'created': letters_created,
        'failed': errors
    }), 201

@admin_bp.route('/revoke-admission', methods=['POST'])
@AuthHandler.token_required
@AuthHandler.admin_required
def revoke_admission(payload):
    """Revoke admission for an applicant"""
    data = request.get_json()
    
    if not data or 'applicant_id' not in data:
        return jsonify({'message': 'applicant_id is required'}), 400
    
    applicant_id = data['applicant_id']
    
    # Update admission status
    success = Database.execute_update(
        'UPDATE applicants SET admission_status = %s WHERE id = %s',
        ('admission_revoked', applicant_id)
    )
    
    if not success:
        return jsonify({'message': 'Failed to revoke admission'}), 500
    
    return jsonify({
        'message': 'Admission revoked successfully'
    }), 200

@admin_bp.route('/statistics', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_statistics(payload):
    """Get application statistics"""
    
    stats = {}
    
    total = Database.execute_query(
        "SELECT COUNT(*) as count FROM applicants WHERE application_status IN ('submitted', 'under_review', 'accepted', 'rejected')"
    )
    stats['total_applications'] = total[0]['count'] if total else 0
    

    by_status = Database.execute_query(
        '''SELECT application_status, COUNT(*) as count
           FROM applicants
           GROUP BY application_status'''
    )
    stats['by_status'] = by_status or []
    

    by_program = Database.execute_query(
        '''SELECT p.name, COUNT(*) as count
           FROM applicants a
           LEFT JOIN programs p ON a.program_id = p.id
           GROUP BY a.program_id, p.name'''
    )
    stats['by_program'] = by_program or []
    
    admitted = Database.execute_query(
        "SELECT COUNT(*) as count FROM applicants WHERE admission_status = 'admitted'"
    )
    stats['total_admitted'] = admitted[0]['count'] if admitted else 0
    
    return jsonify(stats), 200

@admin_bp.route('/letter-templates', methods=['GET'])
@AuthHandler.token_required
@AuthHandler.admin_required
def get_letter_templates(payload):
    """Get all available admission letter templates"""
    templates = get_all_templates()
    return jsonify({'templates': templates}), 200
