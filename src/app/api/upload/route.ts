import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Lazily initializes the Supabase Admin Storage client using the service role key
 * so Next.js `next build` does not fail when runtime env vars are absent at build time.
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }
  return createClient(url, serviceKey);
}

/**
 * POST /api/upload
 * Cloud Media Pipeline:
 * 1. Parses `multipart/form-data` and validates `image/*` MIME types.
 * 2. Generates a collision-resistant filename (`product-<ts>-<rand>-<name>`).
 * 3. Streams the `ArrayBuffer` into the Supabase Storage `product-images` bucket.
 * 4. Returns the CDN-cached public URL for saving onto `Product.imageUrl`.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const bucket = "product-images";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${safeName}`;
    const bytes = await file.arrayBuffer();

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(bucket).upload(filename, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      return NextResponse.json(
        { error: `Supabase upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    return NextResponse.json({
      imageUrl: publicData.publicUrl,
      filename,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

