import Link from "next/link";

export default async function Home() {
  return (
   <div className="flex flex-col gap-4 w-full text-center p-10">
    <h1 className="text-2xl font-bold">File Uploader Examples</h1>
    <Link href="/uppy">Uppy</Link>
    <Link href="/dropzone">Dropzone</Link>
   </div>
  );
}
