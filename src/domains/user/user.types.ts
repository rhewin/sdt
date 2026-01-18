export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string; // ISO date string
  timezone: string; // IANA timezone
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: string;
  timezone?: string;
}
