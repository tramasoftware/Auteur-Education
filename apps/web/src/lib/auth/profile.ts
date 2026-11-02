export const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "nonbinary", label: "Non-binary" },
  { value: "undisclosed", label: "Prefer not to say" },
] as const;

export type Gender = (typeof GENDERS)[number]["value"];

export type RegistrationProfile = {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: Gender;
};

export function genderLabel(value: string): string {
  return GENDERS.find((item) => item.value === value)?.label ?? value;
}

export function birthDateLimits(today = new Date()): { min: string; max: string } {
  return {
    min: isoDate(shiftedYears(today, -120)),
    max: isoDate(shiftedYears(today, -13)),
  };
}

export function formatBirthDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function registrationProfile(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
}): RegistrationProfile {
  const first_name = input.firstName.trim();
  const last_name = input.lastName.trim();
  const birth_date = input.birthDate;
  const limits = birthDateLimits();
  const gender = GENDERS.find((item) => item.value === input.gender)?.value;
  if (
    !first_name ||
    first_name.length > 80 ||
    !last_name ||
    last_name.length > 80 ||
    !parseIsoDate(birth_date) ||
    birth_date < limits.min ||
    birth_date > limits.max ||
    !gender
  ) {
    throw new Error("Check your name, date of birth, and gender, then try again.");
  }
  return { first_name, last_name, birth_date, gender };
}

function shiftedYears(today: Date, years: number): Date {
  return new Date(today.getFullYear() + years, today.getMonth(), today.getDate());
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}
