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
   - `web` — Root Directory を `web` に設定（Framework Presetが自動でNext.jsになる）
   - `export-api` — Root Directory を `export-api` に設定、Framework Presetは **Other**（Vercelが`api/index.py`をPython関数として自動検出する。Build/Install/Output Commandは空欄のままでよい）
   - `web`プロジェクトの Storage タブで Vercel Blob ストアを作成し、**Connect**（既存プロジェクトに接続）する。これで`BLOB_STORE_ID`・`VERCEL_OIDC_TOKEN`・`BLOB_WEBHOOK_PUBLIC_KEY`が自動的に環境変数へ追加される（手動でトークンをコピーする必要はない）
4. `web/.env.example` を参考に残りの環境変数を設定（Vercelはプロジェクト設定の Environment Variables）
   - `EXPORT_API_URL` は `export-api` プロジェクトのデプロイ後URLを設定する
   - Google OAuthの承認済みリダイレクトURIは、`web`プロジェクトの実際のドメインが分かってから設定する（先に仮のURLで作ると後で直し忘れやすい）

### ローカル開発
```
cd web
npm install
vercel link && vercel env pull   # Vercel側の環境変数（DATABASE_URL, AUTH_*, Blob関連）を.env.localに取得
npm run db:migrate               # Neonにテーブルを作成
npm run dev
```
`vercel`コマンドが無い場合は `npm install -g vercel` で入る。CLIを使いたくない場合は、`web/.env.example`を見ながら`.env.local`を手動で作ってもよい（Blob関連の3変数だけは`vercel env pull`でしか取得できないので、その場合サムネイルキャッシュはローカルでは動かない）。
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
