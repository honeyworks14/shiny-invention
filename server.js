require('dotenv').config();

const express = require('express');
const path = require('path');
const { analyzeHandler } = require('./lib/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '경고: GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 만들고 키를 추가하세요 (.env.example 참고).'
  );
}

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/analyze', analyzeHandler);

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
