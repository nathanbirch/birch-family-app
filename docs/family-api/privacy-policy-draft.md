# Privacy policy — draft

**This is a draft, not legal advice, and it makes no claim of compliance with
any particular law.** It has not been reviewed by a lawyer. It describes
accurately what the software does, which is the part this repository can
guarantee; whether that satisfies COPPA, GDPR-K, or anything else is a
question for somebody qualified to answer it.

**You probably do not need this.** ChatGPT asks for a privacy-policy URL when a
Custom GPT is **shared by link or published**. A GPT set to "Only me" does not
need one. If you are here because ChatGPT asked, read
[threat-model.md](threat-model.md#14-the-gpt-shared-beyond-the-family) before
sharing — the field is a symptom of a decision worth reconsidering.

If it is published anywhere, host the text below at a stable URL and put that
URL in the GPT's configuration.

---

## Birch Family App — Family Context API

**Last updated:** _[date]_

### What this is

The Birch Family App is a private application used by one family. It includes a
small read-only interface that lets a private assistant, used only by that
family, look up the family's own day-to-day information — chores, a star chart,
a shared calendar, household rotations and upcoming birthdays.

It is not a product, it is not offered to anyone else, and it has no users
beyond one household.

### What the API receives

When the assistant looks something up, it sends:

- an authentication key, identifying it as the family's own assistant;
- optionally, one first name, indicating which child the question is about;
- the network address the request came from, which the hosting provider
  supplies with every internet request.

**That is everything.** The interface has one optional parameter. It does not
receive the child's message, the conversation, or anything else typed into the
assistant, because there is no field in which such things could be sent.

Note that when an assistant like ChatGPT calls an external interface on a
user's behalf, it sends whatever that interface's parameters call for. This one
calls for a first name and nothing more, which is deliberate: the design keeps
the parameters minimal so that ordinary messages never need to leave the
assistant. It does not receive the ChatGPT account, other conversations, or any
history.

### What the API returns

Only information already visible to the children in the family's own app:

- the first name, birth date and calculated age of the one child named;
- the family's mottoes;
- upcoming birthdays, as a name and a date, with no ages;
- that child's chore-chart rows and star counts;
- who is sitting where this week, and which child has which pet tonight;
- titles, dates and start times of events on the family's shared calendar for
  today and the coming week;
- the household's usual wind-down time.

It **never** returns: home, school or any other address; phone numbers; email
addresses; location data; medical information; financial information;
passwords, keys or account information; private calendar descriptions; notes
intended for parents only; or any information about a child other than the one
named.

### Logging and retention

Each request produces one log line recording the time, which interface was
called, the result, how long it took, whether a limit was reached, and an
opaque reference number.

Logs deliberately **do not** record: the authentication key; which child was
asked about; any chore, calendar or announcement text; any birth date; the
response; or a network address. Network addresses are converted, using a random
value that is discarded when the server restarts, into a short code used only
to count repeated failed attempts. The conversion cannot be reversed by anyone,
including the family.

Logs are kept by the hosting provider for the period its plan provides —
currently a short window measured in hours — and are then deleted. They are
readable only by the parent who administers the application.

The interface stores nothing else. It keeps a short-lived counter of how many
requests have been made each day, which deletes itself automatically, and
contains no personal information at all.

### What is not done with the data

- It is not sold, rented, shared, or transferred to anyone.
- It is not used for advertising, profiling or analytics.
- It is not used to train any model.
- It is not combined with information from anywhere else.

### Who this is for

Members of one household, on shared devices, with a parent present. It is not
offered to the public and children do not have individual accounts on it.

### Changes and questions

Material changes will be reflected in this document and the date above updated.

Questions, or a request to see or delete anything held: _[contact placeholder —
insert an address you are willing to publish]_.

---

## Notes for whoever publishes this

- Fill in the date and the contact placeholder. Do not publish with either left
  as written.
- Do not add a claim of COPPA or GDPR compliance. The text above describes
  behaviour and stops there, on purpose.
- If the response ever gains a field, update *What the API returns* in the same
  change. A privacy policy that lags the code is worse than none.
- Keep it consistent with [privacy-data-map.md](privacy-data-map.md), which is
  the technical version of the same list and should be treated as the source of
  truth.
