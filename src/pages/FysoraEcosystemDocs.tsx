import { useMemo } from "react";
import { NavLink, useParams, Navigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import indexMd from "../../FYSORA_ECOSYSTEM/index.md?raw";
import governanceMd from "../../FYSORA_ECOSYSTEM/Ecosystem_Governance.md?raw";
import authMd from "../../FYSORA_ECOSYSTEM/Authentication_SSO.md?raw";
import apiMd from "../../FYSORA_ECOSYSTEM/API_Synchronization.md?raw";
import commerceMd from "../../FYSORA_ECOSYSTEM/Commercialization_Subscription.md?raw";

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { BookOpen, ShieldCheck, Network, CreditCard, LayoutGrid } from "lucide-react";

type DocKey = "index" | "Ecosystem_Governance" | "Authentication_SSO" | "API_Synchronization" | "Commercialization_Subscription";

const DOCS: Record<DocKey, { title: string; content: string; icon: typeof BookOpen }> = {
  index: { title: "Overview", content: indexMd, icon: LayoutGrid },
  Ecosystem_Governance: { title: "Ecosystem Governance", content: governanceMd, icon: BookOpen },
  Authentication_SSO: { title: "Authentication & SSO", content: authMd, icon: ShieldCheck },
  API_Synchronization: { title: "API Synchronization", content: apiMd, icon: Network },
  Commercialization_Subscription: { title: "Commercialization & Subscription", content: commerceMd, icon: CreditCard },
};

const ORDER: DocKey[] = [
  "index",
  "Ecosystem_Governance",
  "Authentication_SSO",
  "API_Synchronization",
  "Commercialization_Subscription",
];

function toRoute(href: string): string | null {
  if (!href) return null;
  // strip .md and any leading ./
  const cleaned = href.replace(/^\.\//, "").replace(/\.md(#.*)?$/i, "$1");
  const [path, hash] = cleaned.split("#");
  if (path === "index" || path === "") {
    return `/fysora-ecosystem${hash ? `#${hash}` : ""}`;
  }
  if ((ORDER as string[]).includes(path)) {
    return `/fysora-ecosystem/${path}${hash ? `#${hash}` : ""}`;
  }
  return null;
}

export default function FysoraEcosystemDocs() {
  const { doc } = useParams<{ doc?: string }>();
  const key = (doc && (ORDER as string[]).includes(doc) ? doc : "index") as DocKey;

  if (doc && !(ORDER as string[]).includes(doc)) {
    return <Navigate to="/fysora-ecosystem" replace />;
  }

  const active = DOCS[key];

  const components = useMemo(
    () => ({
      a: ({ href, children, ...rest }: any) => {
        const route = href ? toRoute(href) : null;
        if (route) {
          return (
            <NavLink to={route} className="text-primary underline underline-offset-2 hover:opacity-80">
              {children}
            </NavLink>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2 hover:opacity-80" {...rest}>
            {children}
          </a>
        );
      },
      h1: (props: any) => <h1 className="text-3xl font-bold tracking-tight mb-4 mt-2" {...props} />,
      h2: (props: any) => <h2 className="text-2xl font-semibold mt-8 mb-3 border-b pb-2" {...props} />,
      h3: (props: any) => <h3 className="text-xl font-semibold mt-6 mb-2" {...props} />,
      p: (props: any) => <p className="leading-7 my-3" {...props} />,
      ul: (props: any) => <ul className="list-disc pl-6 my-3 space-y-1" {...props} />,
      ol: (props: any) => <ol className="list-decimal pl-6 my-3 space-y-1" {...props} />,
      li: (props: any) => <li className="leading-7" {...props} />,
      code: ({ inline, children, ...rest }: any) =>
        inline ? (
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...rest}>{children}</code>
        ) : (
          <code className="block bg-muted p-3 rounded text-sm overflow-x-auto" {...rest}>{children}</code>
        ),
      pre: (props: any) => <pre className="bg-muted rounded my-4 overflow-x-auto" {...props} />,
      table: (props: any) => (
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm" {...props} />
        </div>
      ),
      th: (props: any) => <th className="border px-3 py-2 text-left bg-muted font-semibold" {...props} />,
      td: (props: any) => <td className="border px-3 py-2 align-top" {...props} />,
      blockquote: (props: any) => <blockquote className="border-l-4 pl-4 italic my-4 text-muted-foreground" {...props} />,
      hr: () => <hr className="my-8 border-border" />,
    }),
    [],
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>FYSORA Ecosystem</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {ORDER.map((k) => {
                    const item = DOCS[k];
                    const to = k === "index" ? "/fysora-ecosystem" : `/fysora-ecosystem/${k}`;
                    return (
                      <SidebarMenuItem key={k}>
                        <SidebarMenuButton asChild isActive={k === key}>
                          <NavLink to={to} end className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2 gap-2 sticky top-0 bg-background/95 backdrop-blur z-10">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground truncate">FYSORA Ecosystem / {active.title}</span>
          </header>
          <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {active.content}
              </ReactMarkdown>
            </article>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}