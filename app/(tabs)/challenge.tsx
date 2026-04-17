import { StyleSheet, Text, View } from "react-native";

export default function ChallengeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Challenges coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    fontSize: 16,
  },
});
