package cli

import (
	"fmt"
	"os"
)

func StartCLI() {
	fmt.Println("🧠 NeuroEdge CLI Activated")
	fmt.Println("Type 'help' for commands")

	for {
		var cmd string
		fmt.Print("neuro> ")
		fmt.Scanln(&cmd)

		switch cmd {
		case "status":
			fmt.Println("System online. All agents operational.")
		case "agents":
			fmt.Println("Listing active agents...")
		case "shutdown":
			fmt.Println("Shutdown requested.")
			os.Exit(0)
		default:
			fmt.Println("Unknown command")
		}
	}
}
