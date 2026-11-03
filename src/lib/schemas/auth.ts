import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(72),
});

export type Credentials = z.infer<typeof credentialsSchema>;
