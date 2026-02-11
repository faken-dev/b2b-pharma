export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  maxAgeDays?: number;
  preventReuse: number;
  maxAttempts: number;
  lockoutDurationMinutes: number;
}

export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  maxAgeDays: 90,
  preventReuse: 5,
  maxAttempts: 5,
  lockoutDurationMinutes: 30,
};

export const strictPasswordPolicy: PasswordPolicy = {
  minLength: 16,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  maxAgeDays: 60,
  preventReuse: 10,
  maxAttempts: 3,
  lockoutDurationMinutes: 60,
};
