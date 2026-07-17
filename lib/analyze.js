const multer = require('multer');

// Free-tier Gemini flash-lite model with vision support (always-current alias).
const GEMINI_MODEL = 'gemini-flash-lite-latest';
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

const ANALYSIS_PROMPT = `당신은 한식에 정통한 영양 분석 전문가입니다. 첨부된 음식 사진을 다음 순서로 분석하세요.

1. 사진 속 각 음식의 종류와 조리법(튀김/볶음/구이/찜/삶음 등)을 먼저 파악합니다.
2. 접시 크기, 수저, 손 등 사진 속 기준물을 참고해 분량을 추정합니다. 참고 기준값 예시: 공기밥 1공기(210g)≈300kcal, 계란후라이 1개≈90kcal, 삼겹살 100g≈330kcal, 김치찌개 1인분≈250kcal. 튀김·볶음 요리는 기름 흡수로 같은 재료의 찜·구이·삶음 요리보다 20~30% 칼로리가 높다고 가정하세요.
3. 위 판단을 바탕으로 항목별 칼로리와 총 영양성분을 계산합니다.

예외 상황 처리:
- 사진에 음식이 없거나 무엇인지 전혀 알 수 없으면 items를 빈 배열로, total_calories 등 수치는 0으로, confidence는 "low"로 하고 notes에 이유를 설명하세요.
- 포장 식품에 영양성분표가 보이면 추정 대신 라벨에 적힌 값을 우선 사용하고 notes에 "라벨 기준"이라고 표시하세요.
- 여러 명이 먹을 분량이나 여러 접시가 함께 보이면 보이는 전체 분량 기준으로 계산하고 notes에 "약 n인분 추정"이라고 표시하세요.

confidence 판단 기준:
- high: 음식 종류와 분량이 사진에서 명확히 식별됨
- medium: 일부 재료가 가려져 있거나 여러 재료가 섞인 요리라 분량 판단이 어려움
- low: 사진이 흐리거나 생소한 음식이거나 음식 자체를 알아보기 어려움

items 배열에는 사진 속 음식을 각각 나열하고, total_calories는 모든 항목의 합으로 계산하세요.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      description: '사진에서 식별된 음식 목록',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '음식 이름 (한국어)' },
          portion: { type: 'STRING', description: '예상 분량 (예: 1인분, 200g)' },
          calories: { type: 'NUMBER' },
        },
        required: ['name', 'portion', 'calories'],
      },
    },
    total_calories: { type: 'NUMBER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    notes: { type: 'STRING', description: '추정에 대한 짧은 설명이나 주의사항 (한국어)' },
  },
  required: ['items', 'total_calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence', 'notes'],
};

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
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
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

    const result = JSON.parse(text);
    res.status(200).json(result);
  } catch (error) {
    console.error('분석 오류:', error);
    res.status(500).json({ error: '이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.' });
  }
}

module.exports = { analyzeHandler, MAX_UPLOAD_BYTES };
