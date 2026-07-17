# 음식 사진 칼로리 계산기

음식 사진을 업로드하면 Claude Vision API가 음식을 인식하고 칼로리와 영양 성분을 추정해주는 웹앱입니다.

## 실행 방법

1. 의존성 설치

   ```bash
   npm install
   ```

2. 환경 변수 설정

   ```bash
   cp .env.example .env
   ```

   `.env` 파일을 열어 `ANTHROPIC_API_KEY`에 자신의 Anthropic API 키를 입력하세요.
   (https://console.anthropic.com 에서 발급)

3. 서버 실행

   ```bash
   npm start
   ```

4. 브라우저에서 `http://localhost:3000` 접속

## 사용 방법

1. 메인 화면에서 음식 사진을 클릭하거나 드래그해서 업로드
2. "칼로리 분석하기" 버튼 클릭
3. AI가 분석한 음식 목록, 예상 총 칼로리, 탄단지(탄수화물/단백질/지방) 확인

## 기술 스택

- 백엔드: Node.js, Express, Multer(이미지 업로드)
- AI: Anthropic Claude API (Vision)
- 프론트엔드: 순수 HTML/CSS/JavaScript

## 참고 사항

- 칼로리는 AI의 추정치이며 실제 값과 차이가 있을 수 있습니다.
- 업로드된 이미지는 서버에 저장되지 않고 분석 후 즉시 폐기됩니다.
