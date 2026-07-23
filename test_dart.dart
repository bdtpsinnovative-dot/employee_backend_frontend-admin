void main() {
  try {
    print(DateTime.parse("0001-01-01T00:00:00Z"));
  } catch (e) {
    print("Error: $e");
  }
}
