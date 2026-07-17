require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    '경고: ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 만들고 키를 추가하세요 (.env.example 참고).'
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  },
});

app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/analyze', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: '사진을 업로드해주세요.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res
        .status(500)
        .json({ error: '서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.' });
    }

    try {
      const base64Image = req.file.buffer.toString('base64');

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: req.file.mimetype,
                  data: base64Image,
                },
              },
              { type: 'text', text: ANALYSIS_PROMPT },
            ],
          },
        ],
      });

      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock) {
        throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
      }

      const result = extractJson(textBlock.text);
      res.json(result);
    } catch (error) {
      console.error('분석 오류:', error);
      res.status(500).json({ error: '이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
