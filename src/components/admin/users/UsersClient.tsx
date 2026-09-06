"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, User, Pencil, Trash2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/organisms/dialog";
import { PasswordInput } from "@/components/ui/atoms/PasswordInput";

interface CustomerRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
  _count: { bookings: number; reviews: number };
}

interface Props {
  initialCustomers: CustomerRow[];
  totalCount: number;
  deletedCount: number;
}

export function UsersClient({ initialCustomers, totalCount, deletedCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);

  // Server-paginated: this list previously capped at the first 200 rows
  // (fetched once, filtered/paginated in the browser), silently hiding
  // anything older and making search unable to find records beyond that
  // snapshot. This now calls the already-existing, correctly paginated
  // /api/users endpoint for every page/search/filter change — the initial
  // page still renders instantly from the server-fetched props below, no
  // fetch needed on first paint. `deletedCount` is a prop, not local state:
  // it only ever changes via a delete/restore mutation, which already calls
  // router.refresh() below to bring it (and every other server-computed
  // figure) back in sync.
  const [customers, setCustomers] = useState(initialCustomers);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasMounted = useRef(false);

  // Debounce search input — avoids a network round trip on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change should jump back to page 1, same as the old client-side
  // pagination's auto-clamp when the filtered set shrank.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, showDeleted]);

  async function fetchCustomers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        role: "CUSTOMER",
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (showDeleted) params.set("includeDeleted", "1");
      const res = await fetch(`/api/users?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { users: CustomerRow[]; total: number };
      setCustomers(data.users);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Skip the redundant fetch on first mount — initialCustomers/totalCount
    // already came from the server render.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, showDeleted]);

  function changePageSize(n: number) {
    setPageSize(n);
    setPage(1);
  }

  function runAction(label: string, fn: () => Promise<Response>) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data.error === "string" ? data.error : `${label} failed.`);
        }
        toast.success(`${label} succeeded.`);
        setEditing(null);
        router.refresh();
        fetchCustomers();
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : `${label} failed.`);
      }
    });
  }

  function doDelete(u: CustomerRow, permanent: boolean) {
    setDeleting(null);
    runAction(permanent ? "Permanent delete" : "Soft delete", () =>
      fetch(`/api/users/${u.id}${permanent ? "?permanent=1" : ""}`, { method: "DELETE" }),
    );
  }

  function handlePermanentDelete(u: CustomerRow) {
    if (
      !confirm(
        `PERMANENTLY delete ${u.name ?? u.email}? This cannot be undone. Their bookings and reviews will be unlinked and any itineraries deleted.`,
      )
    )
      return;
    runAction("Permanent delete", () =>
      fetch(`/api/users/${u.id}?permanent=1`, { method: "DELETE" }),
    );
  }

  function handleRestore(u: CustomerRow) {
    runAction("Restore", () => fetch(`/api/users/${u.id}/restore`, { method: "POST" }));
  }

  function handleSaveEdit(form: EditPayload) {
    if (!editing) return;
    runAction("Save", () =>
      fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">Customers</h2>
          <p className="text-muted-foreground text-xs mt-0.5">{total} customers</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or phone..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-muted/50"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground self-center shrink-0 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded border-border"
            />
            Show deleted{deletedCount > 0 ? ` (${deletedCount})` : ""}
          </label>
          <p className="text-xs text-muted-foreground self-center shrink-0">
            {total} results{loading ? " · loading…" : ""}
          </p>
        </div>

        <div className={cn("overflow-x-auto", loading && "opacity-60 pointer-events-none")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {["User", "Phone", "Bookings", "Reviews", "Joined", "Last Login", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No customers found.
                  </td>
                </tr>
              ) : (
                customers.map((u) => {
                  const isDeleted = !!u.deletedAt;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        isDeleted && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "font-semibold text-foreground text-xs",
                                isDeleted && "line-through",
                              )}
                            >
                              {u.name ?? "—"}
                              {isDeleted && (
                                <span className="ml-2 text-[10px] font-bold text-destructive uppercase">
                                  deleted
                                </span>
                              )}
                            </p>
                            <p className="text-[12px] text-muted-foreground truncate max-w-[180px]">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {u.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">
                        {u._count.bookings}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">
                        {u._count.reviews}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {u.lastLoginAt ? (
                          <span className="text-muted-foreground">
                            {new Date(u.lastLoginAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "2-digit",
                            })}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold">Never logged in</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isDeleted ? (
                            <>
                              <button
                                onClick={() => handleRestore(u)}
                                disabled={isPending}
                                title="Restore"
                                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Restore
                              </button>
                              <button
                                onClick={() => handlePermanentDelete(u)}
                                disabled={isPending}
                                title="Delete permanently"
                                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg border border-destructive/40 text-destructive hover:bg-red-500 disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Forever
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditing(u)}
                                disabled={isPending}
                                title="Edit"
                                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => setDeleting(u)}
                                disabled={isPending}
                                title="Delete"
                                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          onPageSize={changePageSize}
          noun="customers"
        />
      </div>

      {editing && (
        <EditModal
          user={editing}
          isPending={isPending}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}

      {deleting && (
        <DeleteModal
          user={deleting}
          isPending={isPending}
          onClose={() => setDeleting(null)}
          onSoft={() => doDelete(deleting, false)}
          onPermanent={() => doDelete(deleting, true)}
        />
      )}
    </div>
  );
}

function DeleteModal({
  user,
  isPending,
  onClose,
  onSoft,
  onPermanent,
}: {
  user: CustomerRow;
  isPending: boolean;
  onClose: () => void;
  onSoft: () => void;
  onPermanent: () => void;
}) {
  const [confirmPermanent, setConfirmPermanent] = useState(false);
  const who = user.name ?? user.email;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader>
          <DialogTitle>Delete {who}</DialogTitle>
        </DialogHeader>

        {!confirmPermanent ? (
          <>
            <p className="text-xs text-muted-foreground">Choose how to delete this user.</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={onSoft}
                disabled={isPending}
                className="w-full text-left rounded-xl border border-border p-3 hover:bg-muted disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-foreground">Soft delete</span>
                <span className="block text-[12px] text-muted-foreground mt-0.5">
                  Hide the user and block their login. Reversible — you can restore them later.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmPermanent(true)}
                disabled={isPending}
                className="w-full text-left rounded-xl border border-destructive/40 p-3 hover:bg-red-500 disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-destructive">
                  Permanent delete
                </span>
                <span className="block text-[12px] text-muted-foreground mt-0.5">
                  Remove the row for good. Bookings and reviews are unlinked; itineraries are
                  deleted. Cannot be undone.
                </span>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground">
              Permanently delete <span className="font-semibold">{who}</span>? This{" "}
              <span className="font-semibold">cannot be undone</span>.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmPermanent(false)}
                className="px-3 py-2 text-sm font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onPermanent}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-500 disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EditPayload {
  name: string;
  email: string;
  phone: string | null;
  password?: string;
}

function EditModal({
  user,
  isPending,
  onClose,
  onSave,
}: {
  user: CustomerRow;
  isPending: boolean;
  onClose: () => void;
  onSave: (p: EditPayload) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    const payload: EditPayload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() === "" ? null : phone.trim(),
    };
    if (password) payload.password = password;
    onSave(payload);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-foreground">Edit customer</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit customer dialog"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputCls}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className={inputCls}
            />
          </Field>
          <Field label="Reset password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
              className={inputCls}
            />
            <span className="mt-1 block text-[12px] text-muted-foreground">
              Min 8 characters. The user will be asked to set their own on next login.
            </span>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-xl bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
