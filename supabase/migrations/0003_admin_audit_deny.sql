-- admin_audit is service-role-only by design.
-- Service-role bypasses RLS, so this explicit deny-all policy makes the
-- intent crystal clear and silences the `rls_enabled_no_policy` advisor.

drop policy if exists "admin_audit_deny_all" on public.admin_audit;
create policy "admin_audit_deny_all"
  on public.admin_audit for all
  using (false)
  with check (false);
