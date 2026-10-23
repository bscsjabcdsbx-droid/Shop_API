
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = "admin@shop.local";
  const password = "Admin@12345";
  const passwordHash = await bcrypt.hash(password, 12);

  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    await db.user.update({
      where: { email },
      data: {
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });

    console.log("Đã cập nhật tài khoản admin.");
  } else {
    await db.user.create({
      data: {
        email,
        name: "Quản trị viên",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });

    console.log("Đã tạo tài khoản admin mới.");
  }

  console.log("Email:", email);
  console.log("Mật khẩu:", password);
}

main()
  .catch((error) => {
    console.error("Lỗi:", error);
  })
  .finally(async () => {
    await db.$disconnect();
  });