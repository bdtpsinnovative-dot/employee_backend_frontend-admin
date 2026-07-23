package main
import (
	"fmt"
	"time"
)
func main() {
	fmt.Println(time.Time{}.Format(time.RFC3339Nano))
}
