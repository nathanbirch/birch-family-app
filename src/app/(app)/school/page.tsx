import type { Metadata } from "next";

import { DocumentCard } from "@/components/school/DocumentCard";
import { ChildFace } from "@/components/school/ChildFace";
import { CHILD_IDS, getPerson } from "@/config/family";
import { SCHOOL_DOCUMENTS, documentsForChild } from "@/config/documents";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "School",
};

/**
 * Landing page: whatever applies to everyone, then a face per child.
 *
 * A face only opens a subpage once something has actually come home for that
 * child — see `ChildFace` — so the row doubles as an at-a-glance answer to
 * "has anything shown up for anyone lately" without opening a single page.
 */
export default async function SchoolPage() {
  await requireUser();

  const everyone = SCHOOL_DOCUMENTS.filter((doc) => doc.childIds === "all");
  const children = CHILD_IDS.map((id) => ({
    member: getPerson(id),
    documents: documentsForChild(id),
  }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          School
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          Lunch menus, permission slips and whatever else comes home. Tap a
          face to see what&rsquo;s on file for them.
        </p>
      </header>

      {everyone.length > 0 ? (
        <section className="animate-soft-rise mb-8">
          <h2
            className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            For everyone
          </h2>
          <ul className="flex flex-col gap-3">
            {everyone.map((doc) => (
              <li key={doc.id}>
                <DocumentCard doc={doc} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="animate-soft-rise">
        <h2
          className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          By child
        </h2>
        <ul className="grid grid-cols-3 gap-y-5 sm:grid-cols-5">
          {children.map(({ member, documents }) => (
            <li key={member.id} className="flex justify-center">
              <ChildFace
                member={member}
                active={documents.length > 0}
                documentCount={documents.length}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
