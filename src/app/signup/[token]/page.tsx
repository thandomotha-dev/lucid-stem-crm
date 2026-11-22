import { getInviteForSignup } from "../../../server/invites.ts";
import SignupForm from "./signup-form.tsx";

export default async function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteForSignup(token);
  if (invite.state !== "valid") {
    return (
      <main>
        <h1>Invite link not valid</h1>
        <p>This link has expired, was already used, or was cancelled. Ask for a new invite.</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Create your account</h1>
      <p>You have been invited to {invite.orgName}. Your sign-in email will be <strong>{invite.email}</strong>.</p>
      <SignupForm token={token} />
    </main>
  );
}