const multer = require('multer');

// Free-tier Gemini model with vision support.
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Vercel Serverless Functions cap request bodies at 4.5MB, so we stay under that.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  },
});

const ANALYSIS_PROMPT = `당신은 영양 분석 전문가입니다. 첨부된 음식 사진을 분석해서 다음 정보를 JSON으로만 응답하세요. 다른 설명이나 마크다운 코드블록 없이 순수 JSON 객체만 출력하세요.

형식:
{
  "items": [
    { "name": "음식 이름", "portion": "예상 분량 (예: 1인분, 200g)", "calories": 숫자 }
  ],
  "total_calories": 숫자,
  "protein_g": 숫자,
  "carbs_g": 숫자,
  "fat_g": 숫자,
  "confidence": "high" | "medium" | "low",
  "notes": "추정에 대한 짧은 설명이나 주의사항 (한국어)"
}

사진에 여러 음식이 있으면 items 배열에 각각 나열하고, total_calories는 모든 항목의 합으로 계산하세요. 정확한 값을 알 수 없으므로 합리적인 추정치를 제공하고 confidence로 신뢰도를 표시하세요.`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('응답에서 JSON을 찾을 수 없습니다.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('photo')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function analyzeHandler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await runUpload(req, res);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: '사진을 업로드해주세요.' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다.' });
    return;
  }

  try {
    const base64Image = req.file.buffer.toString('base64');

    const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: req.file.mimetype, data: base64Image } },
              { text: ANALYSIS_PROMPT },
            ],
          },
        ],
      }),
    });

    const payload = await geminiRes.json();

    if (!geminiRes.ok) {
      throw new Error(payload.error?.message || 'Gemini API 호출에 실패했습니다.');
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
    if (!text) {
      throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
    }

    const result = extractJson(text);
    res.status(200).json(result);
  } catch (error) {
    console.error('분석 오류:', error);
    res.status(500).json({ error: '이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.' });
  }
}

module.exports = { analyzeHandler, MAX_UPLOAD_BYTES };
