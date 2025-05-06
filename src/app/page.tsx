import Link from "next/link";

export default async function Home() {
  return (
   <div>
    <Link href="/uppy">Uppy</Link>
    <Link href="/dropzone">Dropzone</Link>
   </div>
  );
}
