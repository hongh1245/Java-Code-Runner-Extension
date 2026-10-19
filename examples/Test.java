public class Test {
    static void mayRisk(int[] num) {
        try {
            System.out.println(num[1] / num[2]);
        } catch (ArithmeticException e) {
            System.out.println("First Exception");
        }
    }

    public static void main(String[] args) {
        try {
            int[] arr = { 0, 200 };
            mayRisk(arr);
        } catch (IllegalArgumentException e1) {
            System.out.println("Second Exception");
        } catch (Exception e2) {
            System.out.println("Third Exception");
        }
    }
}
