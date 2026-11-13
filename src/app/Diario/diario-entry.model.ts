export interface DiarioEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiarioPhoto {
  id: string;
  entryId: string;
  dataUrl: string;
  createdAt: string;
  sortOrder: number;
}

export interface DiarySecurityRecord {
  salt: string;
  hash: string;
  iterations: number;
  failedAttempts: number;
  alarmActive: boolean;
}
