import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { BrandMark } from "@/components/layout/Sidebar";
import { DemoBadge } from "@/components/ui/primitives";

export function SignedOut() {
  const { signInDemo } = useSession();
  const navigate = useNavigate();
  return (
    <div className="signed-out">
      <div className="signed-out__card">
        <BrandMark size={40} />
        <h1 className="signed-out__title">You have signed out</h1>
        <p className="signed-out__text">Sign-in will be handled by the authentication service in a later phase. For now you can return with the development identity.</p>
        <button
          className="btn btn--primary"
          onClick={() => {
            signInDemo();
            navigate("/", { replace: true });
          }}
        >
          Continue with demo identity
        </button>
        <DemoBadge label="Development build" />
      </div>
    </div>
  );
}

/** Shown when the signed-in identity's account is not active: no access is effective. */
export function AccountInactive() {
  const { access, signOut, signInDemo } = useSession();
  const status = access?.user?.accountStatus.replace("_", " ") ?? "inactive";
  return (
    <div className="signed-out">
      <div className="signed-out__card">
        <BrandMark size={40} />
        <h1 className="signed-out__title">Your account is {status}</h1>
        <p className="signed-out__text">No portal access is effective while the account is {status}. Contact your administrator. In this development build you can return to the default demo identity.</p>
        <div className="btn-row">
          <button className="btn btn--primary" onClick={() => signInDemo("USR-1001")}>
            Return to demo administrator
          </button>
          <button className="btn btn--secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
        <DemoBadge label="Development build" />
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page">
      <div className="placeholder">
        <h1 className="placeholder__title">Page not found</h1>
        <p className="placeholder__text">The address does not match a portal page.</p>
        <a className="btn btn--secondary" href="/">
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
