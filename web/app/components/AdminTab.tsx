"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import type { DriveFile } from "@/lib/types";

export function AdminTab() {
  const [folderId, setFolderId] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [fileStatus, setFileStatus] = useState("");

  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [slideNumber, setSlideNumber] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState("");

  const [playName, setPlayName] = useState("");
  const [formation, setFormation] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  async function handleBrowse(e: React.FormEvent) {
    e.preventDefault();
    setFileStatus("読み込み中...");
    try {
      const data = await apiFetch<{ files: DriveFile[] }>(
        `/api/drive/files?folderId=${encodeURIComponent(folderId)}`
      );
      setFiles(data.files);
      setFileStatus("");
    } catch (err) {
      setFileStatus((err as Error).message);
    }
  }

  async function updatePreview(file: DriveFile, slideNum: number) {
    setPreviewStatus("読み込み中...");
    setPreviewUrl(null);
    try {
      const data = await apiFetch<{ thumbnailUrl: string }>(
        `/api/preview?fileId=${encodeURIComponent(file.id)}&slideIndex=${slideNum - 1}`
      );
      setPreviewUrl(data.thumbnailUrl);
      setPreviewStatus("");
    } catch (err) {
      setPreviewStatus((err as Error).message);
    }
  }

  function handleSelectFile(file: DriveFile) {
    setSelectedFile(file);
    updatePreview(file, slideNumber);
  }

  function handleSlideNumberChange(value: number) {
    setSlideNumber(value);
    if (selectedFile) updatePreview(selectedFile, value);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setSaveStatus("先にDriveファイルを選択してください。");
      return;
    }
    setSaveStatus("保存中...");
    try {
      await apiFetch("/api/plays", {
        method: "POST",
        body: JSON.stringify({
          playName,
          formation,
          driveFileId: selectedFile.id,
          slideIndex: slideNumber - 1,
        }),
      });
      setSaveStatus("保存しました。");
      setPlayName("");
      setFormation("");
    } catch (err) {
      setSaveStatus((err as Error).message);
    }
  }

  return (
    <section>
      <h2>Driveフォルダから探す</h2>
      <form onSubmit={handleBrowse}>
        <input
          className="growInput"
          type="text"
          placeholder="Google DriveフォルダID"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
        />
        <button type="submit">一覧表示</button>
      </form>
      <div className="status">{fileStatus}</div>
      <div className="fileList">
        {files.map((file) => (
          <div className="fileRow" key={file.id}>
            <span>{file.name}</span>
            <button type="button" onClick={() => handleSelectFile(file)}>
              選択
            </button>
          </div>
        ))}
      </div>

      <h2>プレーを登録</h2>
      <form className="adminForm" onSubmit={handleRegister}>
        <label>
          選択中のファイル
          <input
            type="text"
            readOnly
            value={selectedFile?.name ?? ""}
            placeholder="上の一覧からファイルを選択してください"
          />
        </label>
        <label>
          スライド番号（1始まり）
          <input
            type="number"
            min={1}
            step={1}
            value={slideNumber}
            onChange={(e) => handleSlideNumberChange(Number(e.target.value))}
          />
        </label>
        <div className="previewBox">
          {previewStatus && <span className="status">{previewStatus}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {previewUrl && <img src={previewUrl} alt="preview" />}
        </div>
        <label>
          プレー名
          <input
            type="text"
            required
            value={playName}
            onChange={(e) => setPlayName(e.target.value)}
          />
        </label>
        <label>
          体型（フォーメーション）
          <input
            type="text"
            value={formation}
            onChange={(e) => setFormation(e.target.value)}
          />
        </label>
        <button type="submit">保存</button>
      </form>
      <div className="status">{saveStatus}</div>
    </section>
  );
}
