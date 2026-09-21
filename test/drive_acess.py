import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# 読み取り専用スコープ
SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly']

# DEFASフォルダID
# TARGET_FOLDER_ID = "1ozZTa_3C0sijDrm5YKSgqb5dediGrSaf"  # ここに共有リンクを入力
TARGET_FOLDER_ID = "1d1hl0YcNeMxd3k26_EY5oIMdwGjLFPQm"  # ここに共有リンクを入力


def main():
    creds = None

    # 過去に取得したトークンがあれば読み込む
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # 有効な認証情報がない場合は新規取得
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            # ローカル待受サーバーを起動してブラウザを開く
            creds = flow.run_local_server(port=0)

        # 次回以降スキップできるようにトークンを保存
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    # Drive API クライアントを構築
    service = build('drive', 'v3', credentials=creds)

    # フォルダIDを指定して中身を検索（ゴミ箱のファイルは除外）
    query = (
        f"'{TARGET_FOLDER_ID}' in parents and trashed = false and ("
        f"mimeType = 'application/vnd.google-apps.folder' or "
        f"mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentaion' or"
        f"mimeType = 'application/vnd.google-apps.presentation' or "
        f"name contains '.pptx'"
        f")"    
    )

    page_token = None
    while True:
        # 指定したフォルダ内のフォルダ・ファイルを取得
        results = service.files().list(
            q=query,
            pageSize=1000,
            fields="nextPageToken, files(id, name, mimeType)",
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()

        items = results.get("files", [])

        for item in items:
            item_path = f

        files = results.get('files', [])

    

    print("\n=== Google Drive 接続成功 ===")
    if not files:
        print("ファイルが見つかりませんでした。")
    else:
        print("直近のファイル一覧:")
        for f in files:
            print(f"- {f['name']} (ID: {f['id']}) [{f['mimeType']}]")

if __name__ == '__main__':
    main()