export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type NewUser = {
  email: string;
  passwordHash: string;
};

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email is already registered");
    this.name = "DuplicateEmailError";
  }
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: NewUser): Promise<UserRecord>;
}
