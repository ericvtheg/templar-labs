import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@templar/ui/components/accordion";
import { Alert, AlertDescription, AlertTitle } from "@templar/ui/components/alert";
import { Avatar, AvatarFallback } from "@templar/ui/components/avatar";
import { Badge } from "@templar/ui/components/badge";
import { Button } from "@templar/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@templar/ui/components/card";
import { Checkbox } from "@templar/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@templar/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@templar/ui/components/dropdown-menu";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { Progress } from "@templar/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@templar/ui/components/select";
import { Separator } from "@templar/ui/components/separator";
import { Switch } from "@templar/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@templar/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@templar/ui/components/tabs";
import { Textarea } from "@templar/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@templar/ui/components/tooltip";
import { useEffect, useId, useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

const componentRows = [
  ["Button", "Actions", "6 variants"],
  ["Dialog", "Overlay", "Portal mounted"],
  ["Select", "Input", "Radix primitive"],
  ["Table", "Data display", "Responsive wrapper"],
  ["Tooltip", "Feedback", "Provider scoped"],
] as const;

type Theme = "system" | "light" | "dark";

function Home() {
  const nameId = useId();
  const notesId = useId();
  const previewId = useId();
  const generatedId = useId();
  const [theme, setTheme] = useState<Theme>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [enabled, setEnabled] = useState(true);
  const [checked, setChecked] = useState(true);
  const effectiveTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);

    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  return (
    <TooltipProvider>
      <main
        className={`${effectiveTheme === "dark" ? "dark " : ""}min-h-screen bg-background text-foreground`}
      >
        <section className="border-b">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl space-y-3">
                <Badge className="w-fit" variant="secondary">
                  Breli App
                </Badge>
                <h1 className="text-4xl font-semibold tracking-normal md:text-5xl">
                  Breli App UI Showcase
                </h1>
                <p className="text-base text-muted-foreground">
                  Shared shadcn components rendered from the monorepo UI package.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline">View package</Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Open dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Shared component import</DialogTitle>
                      <DialogDescription>
                        This dialog comes from Breli App&apos;s shared component library.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                      The showcase app consumes the UI package like any future project app.
                    </div>
                    <DialogFooter>
                      <Button type="button">Done</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Controls</CardTitle>
                <CardDescription>
                  Buttons, inputs, selection, toggles, and form states.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="form">
                  <TabsList>
                    <TabsTrigger value="form">Form</TabsTrigger>
                    <TabsTrigger value="actions">Actions</TabsTrigger>
                    <TabsTrigger value="states">States</TabsTrigger>
                  </TabsList>
                  <TabsContent className="pt-4" value="form">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={nameId}>Name</Label>
                        <Input id={nameId} defaultValue="Breli App" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Theme</Label>
                        <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select theme" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="system">System</SelectItem>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label htmlFor={notesId}>Notes</Label>
                        <Textarea id={notesId} defaultValue="Reusable primitives for product UI." />
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent className="pt-4" value="actions">
                    <div className="flex flex-wrap gap-2">
                      <Button>Default</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="ghost">Ghost</Button>
                      <Button variant="destructive">Destructive</Button>
                    </div>
                  </TabsContent>
                  <TabsContent className="pt-4" value="states">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <Label className="text-sm font-medium" htmlFor={previewId}>
                          Enable preview
                        </Label>
                        <Switch id={previewId} checked={enabled} onCheckedChange={setEnabled} />
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border p-3">
                        <Checkbox
                          id={generatedId}
                          checked={checked}
                          onCheckedChange={(value) => setChecked(value === true)}
                        />
                        <Label className="text-sm font-medium" htmlFor={generatedId}>
                          Include generated components
                        </Label>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Component Inventory</CardTitle>
                <CardDescription>
                  Representative components available through Breli App UI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {componentRows.map(([name, category, status]) => (
                      <TableRow key={name}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{category}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>TL</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>Preview</CardTitle>
                    <CardDescription>Composable surface example.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTitle>Package wired</AlertTitle>
                  <AlertDescription>
                    The app imports shared components directly from the workspace package.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Coverage</span>
                    <span>82%</span>
                  </div>
                  <Progress value={82} />
                </div>
                <Separator />
                <Accordion type="single" collapsible>
                  <AccordionItem value="imports">
                    <AccordionTrigger>Import paths</AccordionTrigger>
                    <AccordionContent>
                      Components are consumed from shared package subpaths.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="styles">
                    <AccordionTrigger>Styles</AccordionTrigger>
                    <AccordionContent>
                      The app stylesheet loads the shared Breli App design system.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
              <CardFooter className="justify-between">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">Hover me</Button>
                  </TooltipTrigger>
                  <TooltipContent>Tooltip from Breli App</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary">Menu</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Showcase</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Copy import</DropdownMenuItem>
                    <DropdownMenuItem>Open registry</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardFooter>
            </Card>
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}
