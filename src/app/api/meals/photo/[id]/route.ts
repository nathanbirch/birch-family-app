import { getCurrentUser } from "@/lib/auth/dal";
import { readRecipePhoto } from "@/lib/meals/store";
import { isItemId } from "@/lib/shopping/list";

/**
 * One meal's photo.
 *
 * A Route Handler rather than a file in `public/`, because the photos are in
 * MongoDB (see `mealPhotos` in `config/db.ts`) and, unlike the avatars, sit
 * behind the login: `proxy.ts` matches this path, and the session is checked
 * again here since the proxy only trusts the cookie's signature.
 *
 * The URL carries the photo's version (`?v=`), so a given URL only ever means
 * one picture and the browser may keep it for a year. `private`, because it is
 * one family's kitchen and no shared cache has any business holding it.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });

  const { id } = await context.params;
  if (!isItemId(id)) return new Response(null, { status: 404 });

  try {
    const photo = await readRecipePhoto(id);
    if (!photo) return new Response(null, { status: 404 });
    return new Response(new Blob([photo.bytes as Uint8Array<ArrayBuffer>]), {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`[meals] Could not read the photo for ${id}:`, error);
    return new Response(null, { status: 503 });
  }
}
