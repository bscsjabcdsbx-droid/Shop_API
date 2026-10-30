import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong file .env");
  }

  if (password.length < 8) {
    throw new Error("Mật khẩu admin phải có ít nhất 8 ký tự");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: {
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      name: "Administrator",
      role: "ADMIN",
      isActive: true,
      cart: {
        create: {},
      },
    },
  });

  console.log("Đã tạo/cập nhật tài khoản admin:", admin.email);
}

main()
  .catch((error) => {
    console.error("Lỗi tạo admin:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });