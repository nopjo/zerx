export interface RobloxAccount {
  Valid: boolean;
  SecurityToken: string;
  Username: string;
  LastUse: string;
  UserID: number;
  Fields: object;
  LastAttemptedRefresh: string;
  Region: string;
  BrowserTrackerID: string | null;
  Group: string;
  Alias: string;
  Description: string;
  Password: string;
}

export interface ExtractedCookie {
  username: string;
  token: string;
  userId: number;
  valid: boolean;
}

export interface CookieFileData {
  filename: string;
  content: string;
}
