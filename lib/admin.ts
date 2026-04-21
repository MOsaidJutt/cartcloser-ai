export const ADMIN_EMAIL = "nick.gaulton1@gmail.com";

export function isAdmin(email: string): boolean {
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
