# Script Controller

### 概要
- ASがスクリプトを作る際のコントローラーを与える
- スクリプトを作成しながら、高速で対応するダミカを参照できる

### 環境
- PC環境は関係なし
- Google Drive に基本pptx形式でダミカテンプレートが存在
- google spreadsheet でスクリプトを作成

### 構成
リポジトリは2つの独立したVercelプロジェクトからなる（両方とも無料枠で動く）:

- **`web/`** — Next.js (App Router)。フロントエンド + APIルート（検索・プレビュー・プレー登録・Driveフォルダ一覧）。DBはNeon（サーバーレスPostgres）、ORMはDrizzle
- **`export-api/`** — 独立したPython (Flask) サービス。エクスポート（保持したスライドをpptxに組み立てる）だけを担当。`python-pptx`にはプレゼンテーション間でスライドをコピーする機能が無いため、その部分（`copy_slide`、ユニットテスト済み）をPythonのまま残している。Next.js側からサーバー間通信でのみ呼ばれ、ブラウザから直接叩かれることはない
- **認証**: Auth.js (next-auth v5)、Googleプロバイダ。各コーチが自分のGoogleアカウントでサインインし、そのDrive権限で動作する（共有サービスアカウントではない）。`access_type=offline`+`prompt=consent`でrefresh_tokenを取得し、Neonの`accounts`テーブルに保存 → アクセストークンが1時間で切れても、サーバー側で自動的に再取得する（ブラウザに再接続を促す必要がない）
- **サムネイルキャッシュ**: Vercel Blob。`(fileId, modifiedTime, slideIndex)`をキーにキャッシュし、元ファイルが編集されると自動的に無効化される

### 事前準備
1. **Neon**: https://neon.tech でプロジェクトを作成し、接続文字列（`DATABASE_URL`、pooled connection）を控える
2. **Google Cloud Console**: OAuth同意画面を設定し、OAuthクライアントID（種類: **Web application**）を作成
   - スコープ: `drive`（読み書き。プレビュー生成のため一時ファイルの作成/削除が必要）、`presentations.readonly`
   - 承認済みリダイレクトURI: `https://<webのVercelドメイン>/api/auth/callback/google`（ローカル用に`http://localhost:3000/api/auth/callback/google`も追加）
3. **Vercel**: 同じGitHubリポジトリから2つのプロジェクトを作成
   - `web` — Root Directory を `web/` に設定
   - `export-api` — Root Directory を `export-api/` に設定（Vercelが自動でPythonランタイムを検出する）
   - `web`プロジェクトに Vercel Blob ストアを作成（Storage タブ）
4. `web/.env.example` を参考に環境変数を設定（ローカルは`.env.local`、Vercelはプロジェクト設定の Environment Variables）
   - `EXPORT_API_URL` は `export-api` プロジェクトのデプロイ後URLを設定する

### ローカル開発
```
cd web
npm install
npx auth secret          # AUTH_SECRET を生成して .env.local に追記
npm run db:push          # Neonにテーブルを作成（開発中の反復はpush、本番運用はgenerate+migrate推奨）
npm run dev
```
```
cd export-api
pip install -r requirements.txt
python api/index.py       # or: vercel dev
```

### テスト
`export-api/test_pptx_builder.py` は Drive/DB に依存しない純粋なユニットテスト（`copy_slide` の中核ロジック）:
```
cd export-api
pytest test_pptx_builder.py
```

### デプロイ
`web`・`export-api` それぞれのVercelプロジェクトが、GitHubへのpushで自動デプロイされる（Vercelダッシュボードで連携）。
