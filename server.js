import express from "express";
import multer from "multer";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const app = express();
const upload = multer({ dest: "uploads/" });
const genAI = new GoogleGenerativeAI("API_KEY"); 

// Bảng keyword như code JS cũ (copy lại phần của bạn nếu muốn chi tiết hơn)
const majorPositionKeywords = {
  IT: {
    backend: ['java', 'spring', 'api', 'microservices', 'mysql', 'docker', 'kubernetes', 'aws', 'git', 'github', 'node.js', 'express'],
    frontend: ['javascript', 'html', 'css', 'react', 'angular', 'ui', 'ux', 'frontend', 'bootstrap', 'typescript', 'tailwind', 'next.js'],
    mobile: ['android', 'ios', 'react native', 'flutter', 'mobile', 'swift', 'kotlin', 'git', 'firebase', 'dart'],
  },
  Marketing: {
    marketing: ['seo', 'google ads', 'content marketing', 'social media', 'campaign management', 'branding', 'market research', 'analytics', 'facebook ads', 'crm'],
    'digital marketing specialist': ['seo', 'sem', 'email marketing', 'google analytics', 'facebook business manager', 'marketing automation', 'a/b testing', 'google ads', 'content strategy'],
    'brand manager': ['brand strategy', 'product positioning', 'market research', 'competitor analysis', 'branding', 'campaign development', 'cross-functional coordination', 'consumer insight', 'budget management']
  },
  Accounting: {
    accounting: ['financial reporting', 'bookkeeping', 'accounts payable', 'accounts receivable', 'reconciliation', 'excel', 'tax compliance', 'financial statements', 'journal entries', 'accounting software'],
    'general accountant': ['general ledger', 'month-end closing', 'financial reporting', 'tax filing', 'vietnam accounting standards', 'excel', 'reconciliation', 'invoicing', 'payroll', 'misa'],
    'cost accountant': ['cost analysis', 'inventory accounting', 'variance analysis', 'budgeting', 'standard costing', 'sap', 'excel', 'financial planning', 'manufacturing cost', 'reporting']
  },
  Finance: {
    finance: ['financial analysis', 'budgeting', 'forecasting', 'investment', 'valuation', 'excel', 'risk management', 'financial modeling', 'capital budgeting', 'kpis'],
    'financial analyst': ['financial modeling', 'excel', 'valuation', 'forecasting', 'ratio analysis', 'power bi', 'budgeting', 'scenario analysis', 'cash flow analysis', 'presentation skills'],
    'investment analyst': ['equity research', 'portfolio management', 'dcf valuation', 'macroeconomic analysis', 'industry analysis', 'bloomberg', 'risk assessment', 'asset allocation', 'financial markets', 'excel']
  },
  HumanResources: {
    'human resources': ['recruitment', 'employee relations', 'hr policies', 'training & development', 'payroll', 'labor law', 'performance management', 'onboarding', 'offboarding', 'hr software'],
    'recruitment specialist': ['sourcing', 'interviewing', 'job posting', 'candidate screening', 'ats', 'linkedin recruiter', 'talent pipeline', 'negotiation', 'offer management', 'hr branding'],
    'hr generalist': ['employee relations', 'training coordination', 'hr administration', 'performance appraisal', 'hr compliance', 'labor contracts', 'benefits', 'attendance tracking', 'hr reporting', 'hr systems']
  }
};

// Hàm đọc text từ PDF bằng pdfjs-dist
async function extractTextFromPDF(filePath) {
  const pdfData = new Uint8Array(fs.readFileSync(filePath));
  const pdfDoc = await getDocument({ data: pdfData }).promise;
  let fullText = "";
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(' ') + ' ';
  }
  return fullText;
}

// Hàm chấm điểm CV
function analyzeText(text, major, position) {
  const keywords = (majorPositionKeywords[major] && majorPositionKeywords[major][position]) ? majorPositionKeywords[major][position] : [];

  const normalized = text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');

  // Skill match (cosine similarity)
  const cvVector = keywords.map(k => normalized.includes(k) ? 1 : 0);
  const keywordVector = Array(keywords.length).fill(1);
  const dot = cvVector.reduce((sum, v, i) => sum + v * keywordVector[i], 0);
  const magA = Math.sqrt(cvVector.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(keywordVector.reduce((sum, v) => sum + v * v, 0));
  const cosine = magA && magB ? dot / (magA * magB) : 0;
  const skillScore = (cosine * 10).toFixed(1);

  // Experience detection
  const yearRanges = [...text.matchAll(/(\d{4})\s*[-–]\s*(\d{4}|present)/gi)];
  let totalYears = 0;
  yearRanges.forEach(([, start, end]) => {
    const s = parseInt(start, 10);
    const e = /present/i.test(end) ? new Date().getFullYear() : parseInt(end, 10);
    if (!isNaN(s) && !isNaN(e) && e >= s) totalYears += (e - s);
  });
  if (totalYears === 0) {
    const m = text.match(/(\d+)\s*(năm|year|yr)s?\s*(kinh nghiệm|experience)/i);
    if (m) totalYears = parseInt(m[1], 10);
  }
  let experienceScore = 0;
  if (totalYears >= 5) experienceScore = 10;
  else if (totalYears >= 3) experienceScore = 7;
  else if (totalYears >= 1) experienceScore = 5;
  else experienceScore = 2;

  // Graduation detection (rút gọn)
  let graduationScore = 0;
  if (/tốt nghiệp loại xuất sắc|loại xuất sắc|gpa[:\s-]*3.8|excellent|distinction/i.test(text)) graduationScore = 10;
  else if (/tốt nghiệp loại giỏi|loại giỏi|gpa[:\s-]*3.5|good|honor/i.test(text)) graduationScore = 8;
  else if (/tốt nghiệp loại khá|loại khá|gpa[:\s-]*3.0/i.test(text)) graduationScore = 6;
  else if (/trung bình|average|pass|gpa[:\s-]*2.5/i.test(text)) graduationScore = 4;

  // Achievement detection
  const achievementTerms = [
    'giải thưởng', 'giải nhất', 'giải nhì', 'giải ba', 'học bổng',
    'nhân viên xuất sắc', 'nhân viên cống hiến',
    'award', 'scholarship', 'top performer', 'best employee', 'recognition'
  ];
  let achievementHits = 0;
  achievementTerms.forEach(term => {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(normalized)) achievementHits++;
  });
  const giaiMatches = normalized.match(/\bgi[ải]+\s+\w+/gi);
  if (giaiMatches) achievementHits += giaiMatches.length;
  const achievementScore = Math.min(achievementHits * 3, 10);

  // Final composite
  const compositeScore = (
    (parseFloat(skillScore) * 0.4) +
    (experienceScore * 0.3) +
    (graduationScore * 0.15) +
    (achievementScore * 0.15)
  ).toFixed(1);

  // Nhận xét tự động mẫu
  let comment = "";
  const score = parseFloat(compositeScore);
  if (score >= 9) {
    comment = 'CV xuất sắc! Bạn rất phù hợp với vị trí đã chọn.';
  } else if (score >= 7) {
    comment = 'CV tốt. Bạn nên cải thiện thêm thành tích hoặc kinh nghiệm để đạt điểm tối đa!';
  } else if (score >= 5) {
    comment = 'CV ở mức trung bình. Hãy bổ sung thêm kỹ năng, kinh nghiệm liên quan hoặc làm nổi bật hơn phần tốt nghiệp và thành tích.';
  } else {
    comment = 'CV cần cải thiện. Hãy bổ sung chi tiết về kinh nghiệm, trình độ và điều chỉnh CV phù hợp với vị trí ứng tuyển.';
  }

  return {
    skillScore,
    experienceScore,
    graduationScore,
    achievementScore,
    compositeScore,
    comment
  };
}

// Cấu hình CORS và static
app.use(cors());
app.use(express.static("public"));

// API nhận file upload và trả kết quả
app.post("/api/analyze", upload.single("cvFile"), async (req, res) => {
  try {
    // Đọc text từ file PDF bằng pdfjs-dist
    const cvText = await extractTextFromPDF(req.file.path);
    const { major, position } = req.body;

    // Tính điểm như cũ
    const analyzeResult = analyzeText(cvText, major, position);

    // Gọi Gemini AI như cũ
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Đây là nội dung CV của ứng viên:\n${cvText}\n\nTóm tắt điểm số hệ thống:\n${JSON.stringify(analyzeResult, null, 2)}\n\nHãy nhận xét chi tiết về CV này: điểm mạnh, điểm yếu, lời khuyên cho ứng viên, đánh giá độ phù hợp với vị trí. Trả lời ngắn gọn bằng tiếng Việt.`;
    const geminiResult = await model.generateContent(prompt);
    const geminiText = (await geminiResult.response).text();

    fs.unlinkSync(req.file.path);

    res.json({
      analyze: analyzeResult,
      aiComment: geminiText
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
