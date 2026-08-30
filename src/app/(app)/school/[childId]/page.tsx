import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { DocumentCard } from "@/components/school/DocumentCard";
import { CHILD_IDS, getPerson, type ChildId } from "@/config/family";
import { documentsForChild } from "@/config/documents";
import { requireUser } from "@/lib/auth/dal";

type PageProps = {
  /** Async in this version of Next — it must be awaited before it is read. */
  params: Promise<{ childId: string }>;
};

function isChildId(value: string): value is ChildId {
  return (CHILD_IDS as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { childId } = await params;
  return { title: isChildId(childId) ? getPerson(childId).name : "School" };
}

/**
 * One child's documents, on their own page.
 *
 * A real route rather than an expanding panel on `/school`, matching Health's
 * reasoning: the back button behaves the way a child expects, and this list
 * starts at its own top instead of wherever the roster happened to be
 * scrolled to.
 *
 * An unknown or documentless child 404s — `ChildFace` never links here unless
 * there is something to show, so landing on this page with nothing to show
 * means the URL was typed or bookmarked, not tapped.
 */
export default async function SchoolChildPage({ params }: PageProps) {
  await requireUser();

  const { childId } = await params;
  if (!isChildId(childId)) notFound();

  const member = getPerson(childId);
  const documents = documentsForChild(childId);
  if (documents.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <Link
        href="/school"
        className="animate-soft-fade mb-4 inline-flex items-center gap-1.5 text-sm font-bold"
        style={{ color: "var(--color-primary)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 5-7 7 7 7" />
        </svg>
        School
      </Link>

      <header className="animate-soft-rise mb-6 flex items-center gap-4">
        <div className="w-14 shrink-0 sm:w-16">
          <Avatar member={member} showName={false} arriving />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {member.name}&rsquo;s School Documents
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {documents.length} document{documents.length === 1 ? "" : "s"} on file
          </p>
        </div>
      </header>

      <ul className="animate-soft-rise flex flex-col gap-3">
        {documents.map((doc) => (
          <li key={doc.id}>
            <DocumentCard doc={doc} />
          </li>
        ))}
      </ul>
    </main>
  );
}
