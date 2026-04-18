import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function LogoutScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login" as any);
  }, []);

  return null;
}
