import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = "admin@shop.local";

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (!user) {
    console.log("Không tìm thấy tài khoản admin trong database.");
    return;
  }

  console.log("Tìm thấy tài khoản:", user);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());