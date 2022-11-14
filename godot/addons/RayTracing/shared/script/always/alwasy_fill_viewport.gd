@tool

extends Node

@onready var control: Control = $".."
@onready var viewport: SubViewport = $"../.."

func _process(_delta: float) -> void:
    control.size = viewport.size
