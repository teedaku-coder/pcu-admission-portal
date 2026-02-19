import os
import re
import io
import base64
from datetime import datetime
from html.parser import HTMLParser
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib import colors

class HTMLToFlowablesParser(HTMLParser):
    """Parse HTML and convert to ReportLab Flowables"""
    
    def __init__(self):
        super().__init__()
        self.flowables = []
        self.current_text = ""
        self.styles = getSampleStyleSheet()
        self.list_items = []
        self.in_list = False
        self.in_div = False
        self.current_div_class = ""
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == "br":
            if self.current_text:
                self.current_text += "<br/>"
        elif tag == "p":
            if self.current_text.strip():
                style = self._get_paragraph_style()
                self.flowables.append(Paragraph(self.current_text, style))
                self.current_text = ""
            self.in_div = False
        elif tag == "div":
            class_name = attrs_dict.get("class", "")
            if class_name in ["body", "closing", "office-details", "ref-date", "office-info"]:
                if self.current_text.strip():
                    style = self._get_paragraph_style()
                    self.flowables.append(Paragraph(self.current_text, style))
                    self.current_text = ""
                self.in_div = True
                self.current_div_class = class_name
            else:
                self.in_div = False
        elif tag == "ol":
            self.in_list = True
            self.list_items = []
        elif tag == "li":
            self.list_items.append("")
        elif tag == "strong" or tag == "b":
            self.current_text += "<b>"
        elif tag == "em" or tag == "i":
            self.current_text += "<i>"
        elif tag == "table":
            # For tables like ref-date, we'll handle specially
            pass
        elif tag == "tr":
            pass
        elif tag == "td":
            pass
        elif tag == "span":
            if "style" in attrs_dict or "class" in attrs_dict:
                # Check for bold styling
                if "font-weight: bold" in attrs_dict.get("style", ""):
                    self.current_text += "<b>"
                    
    def handle_endtag(self, tag):
        if tag == "p":
            if self.current_text.strip():
                style = self._get_paragraph_style()
                self.flowables.append(Paragraph(self.current_text, style))
                self.current_text = ""
        elif tag == "div":
            if self.current_text.strip():
                style = self._get_paragraph_style()
                self.flowables.append(Paragraph(self.current_text, style))
                self.current_text = ""
            self.in_div = False
            self.current_div_class = ""
        elif tag == "ol":
            self.in_list = False
            # Add all list items as flowables
            for item in self.list_items:
                if item.strip():
                    style = self._get_paragraph_style()
                    self.flowables.append(Paragraph(f"• {item}", style))
            self.list_items = []
        elif tag == "li":
            if self.list_items and self.current_text.strip():
                self.list_items[-1] = self.current_text
                self.current_text = ""
        elif tag == "strong" or tag == "b":
            self.current_text += "</b>"
        elif tag == "em" or tag == "i":
            self.current_text += "</i>"
        elif tag == "span":
            if self.current_text.endswith("<b"):
                self.current_text += "></b>"
                
    def handle_data(self, data):
        # Clean up whitespace but preserve intentional spacing
        text = data.strip()
        if text:
            if self.in_list and self.list_items:
                self.list_items[-1] += text + " "
            else:
                self.current_text += text + " "
    
    def _get_paragraph_style(self):
        """Get appropriate paragraph style based on context"""
        style = ParagraphStyle(
            'CustomBody',
            parent=self.styles['Normal'],
            fontSize=11,
            leading=14,
            spaceAfter=8,
            alignment=TA_LEFT,
            fontName='Times-Roman'
        )
        return style

class PDFGenerator:
    """Generate PDFs from HTML using ReportLab (cross-platform, no system dependencies)."""

    @staticmethod
    def _load_template():
        template_path = os.path.join(
            os.path.dirname(__file__),
            "admission_letter_template.html",
        )
        if os.path.exists(template_path):
            with open(template_path, "r", encoding="utf-8") as f:
                return f.read()
        return "<p>No template found</p>"

    @staticmethod
    def generate_admission_letter_pdf(body_html: str = "", **kwargs) -> bytes:
        # Load template if no HTML provided
        if not body_html.strip():
            body_html = PDFGenerator._load_template()

        # Replace placeholders in the template
        for key, value in kwargs.items():
            pattern = r"\{\{\s*" + re.escape(key) + r"\s*\}\}"
            body_html = re.sub(pattern, str(value or ""), body_html, flags=re.IGNORECASE)

        # Create PDF document in memory
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=letter,
                                rightMargin=0.75*inch, leftMargin=0.75*inch,
                                topMargin=0.75*inch, bottomMargin=0.75*inch)
        
        # Parse HTML and build flowables
        parser = HTMLToFlowablesParser()
        
        # Extract body content from HTML
        body_match = re.search(r'<body[^>]*>(.*?)</body>', body_html, re.DOTALL)
        if body_match:
            body_content = body_match.group(1)
        else:
            body_content = body_html
            
        parser.feed(body_content)
        
        story = parser.flowables.copy()
        
        # Add footer with generation date
        story.append(Spacer(1, 0.3*inch))
        styles = getSampleStyleSheet()
        footer_text = f"Generated on {datetime.now().strftime('%d %B %Y')}"
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#64748b'),
            alignment=TA_CENTER
        )
        story.append(Paragraph(footer_text, footer_style))
        
        # Build PDF
        doc.build(story)
        pdf_buffer.seek(0)
        return pdf_buffer.getvalue()
