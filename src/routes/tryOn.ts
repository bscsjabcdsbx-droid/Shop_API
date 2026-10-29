
import { Router } from "express";
import multer from "multer";
import type { Request, Response } from "express";
import { db } from "../lib.js";

const router = Router();

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, callback) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.mimetype)) {
      callback(new Error("Chỉ chấp nhận JPEG, PNG hoặc WEBP"));
      return;
    }

    callback(null, true);
  },
});

router.post(
  "/",
  upload.single("personImage"),
  async (req: Request, res: Response) => {
    try {
      // Product.id trong schema.prisma là Int.
      const productId = Number(req.body.productId);
      const clothType = String(req.body.clothType ?? "upper");

      if (!req.file) {
        res.status(400).json({
          error: "Bạn chưa tải ảnh người lên.",
        });
        return;
      }

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0
      ) {
        res.status(400).json({
          error: "productId không hợp lệ.",
        });
        return;
      }

      if (!["upper", "lower", "overall"].includes(clothType)) {
        res.status(400).json({
          error: "Loại quần áo không hợp lệ.",
        });
        return;
      }

      // Lấy sản phẩm cùng danh sách ảnh theo đúng schema Shop_API.
      const product = await db.product.findFirst({
        where: {
          id: productId,
          isActive: true,
        },
        include: {
          images: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!product) {
        res.status(404).json({
          error: "Không tìm thấy sản phẩm đang hoạt động.",
        });
        return;
      }

      // ProductImage.url là URL ảnh; images là một mảng.
      const garmentPath = product.images[0]?.url;

      if (!garmentPath) {
        res.status(400).json({
          error: "Sản phẩm chưa có ảnh.",
        });
        return;
      }

      // Chuyển đường dẫn tương đối thành URL đầy đủ nếu cần.
      const publicApiBase = (
        process.env.PUBLIC_API_BASE_URL ??
        "http://localhost:4000"
      ).replace(/\/+$/, "");

      let garmentUrl: URL;

      try {
        garmentUrl = new URL(
          garmentPath,
          `${publicApiBase}/`
        );
      } catch {
        res.status(400).json({
          error: "Đường dẫn ảnh sản phẩm không hợp lệ.",
        });
        return;
      }

      if (!["http:", "https:"].includes(garmentUrl.protocol)) {
        res.status(400).json({
          error: "Giao thức URL ảnh không được hỗ trợ.",
        });
        return;
      }

      // Tải ảnh sản phẩm từ URL trong cơ sở dữ liệu.
      const garmentResponse = await fetch(garmentUrl, {
        signal: AbortSignal.timeout(30000),
      });

      if (!garmentResponse.ok) {
        res.status(502).json({
          error: "Không tải được ảnh sản phẩm.",
        });
        return;
      }

      const garmentType = (
        garmentResponse.headers.get("content-type") ?? ""
      ).split(";")[0].trim().toLowerCase();

      if (
        !["image/jpeg", "image/png", "image/webp"].includes(
          garmentType
        )
      ) {
        res.status(400).json({
          error: "Ảnh sản phẩm không đúng định dạng hỗ trợ.",
        });
        return;
      }

      const declaredSize = Number(
        garmentResponse.headers.get("content-length")
      );

      if (
        Number.isFinite(declaredSize) &&
        declaredSize > MAX_IMAGE_SIZE
      ) {
        res.status(400).json({
          error: "Ảnh sản phẩm vượt quá 8 MB.",
        });
        return;
      }

      const garmentBuffer = Buffer.from(
        await garmentResponse.arrayBuffer()
      );

      if (garmentBuffer.length > MAX_IMAGE_SIZE) {
        res.status(400).json({
          error: "Ảnh sản phẩm vượt quá 8 MB.",
        });
        return;
      }

      // Gửi hai ảnh sang CatVTON API.
      const form = new FormData();

      form.append(
        "person_image",
        new Blob([new Uint8Array(req.file.buffer)], {
          type: req.file.mimetype,
        }),
        "person-image"
      );

      form.append(
        "cloth_image",
        new Blob([new Uint8Array(garmentBuffer)], {
          type: garmentType,
        }),
        "garment-image"
      );

      form.append("cloth_type", clothType);

      const catVtonUrl =
        process.env.CATVTON_API_URL ??
        "http://127.0.0.1:8000/try-on";

      const aiResponse = await fetch(catVtonUrl, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(180000),
      });

      if (!aiResponse.ok) {
        const detail = await aiResponse.text();

        console.error(
          "CatVTON API error:",
          aiResponse.status,
          detail
        );

        res.status(502).json({
          error: "AI chưa tạo được ảnh. Hãy thử lại sau.",
        });
        return;
      }

      const resultType = (
        aiResponse.headers.get("content-type") ?? ""
      ).split(";")[0].trim().toLowerCase();

      if (!["image/png", "image/jpeg", "image/webp"].includes(resultType)) {
        res.status(502).json({
          error: "CatVTON trả về dữ liệu không phải ảnh hỗ trợ.",
        });
        return;
      }

      const resultBuffer = Buffer.from(
        await aiResponse.arrayBuffer()
      );

      res.setHeader("Content-Type", resultType);
      res.setHeader("Cache-Control", "no-store");
      res.send(resultBuffer);
    } catch (error) {
      console.error("Try-on error:", error);

      if (
        error instanceof Error &&
        (error.name === "TimeoutError" ||
          error.name === "AbortError")
      ) {
        res.status(504).json({
          error: "AI xử lý quá lâu hoặc yêu cầu đã bị hủy.",
        });
        return;
      }

      res.status(500).json({
        error: "Đã xảy ra lỗi khi xử lý yêu cầu thử đồ.",
      });
    }
  }
);

export default router;
