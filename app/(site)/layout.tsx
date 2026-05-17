import "./site.css";

export const metadata = {
  title: "FlowLeadz — Your Revenue, On Autopilot",
  description:
    "Done-for-you Meta ads, automation, CRM, and organic growth for contractors and operators.",
  openGraph: {
    title: "FlowLeadz — Your Revenue, On Autopilot",
    description:
      "Done-for-you Meta ads, automation, CRM, and organic growth for contractors and operators.",
    type: "website",
    images: ["/logo-full.png"],
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-scope">{children}</div>;
}
