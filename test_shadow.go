package main
import (
	"encoding/json"
	"fmt"
	"time"
)
type Task struct {
	ID      string     `json:"id"`
	DueDate *time.Time `json:"due_date"`
}
func (t Task) MarshalJSON() ([]byte, error) {
	type Alias Task
	dueDate := time.Time{}.Format(time.RFC3339Nano)
	if t.DueDate != nil {
		dueDate = t.DueDate.Format(time.RFC3339Nano)
	}
	return json.Marshal(&struct {
		Alias
		DueDate string `json:"due_date"`
	}{
		Alias:   (Alias)(t),
		DueDate: dueDate,
	})
}
func main() {
	t := Task{ID: "123", DueDate: nil}
	b, _ := json.Marshal(t)
	fmt.Println(string(b))
}
