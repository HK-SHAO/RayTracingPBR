@tool

class_name FreeCamera3D

extends Camera3D

@export_range(0, 10, 0.01) var sensitivity:float = 3
@export_range(0, 1000, 0.1) var velocity:float = 5
@export_range(0, 1, 0.0001) var acceleration:float = 0.01
@export_range(0, 10, 0.01) var speed_scale:float = 1.01
@export var max_speed:float = 1000
@export var min_speed:float = 0.0
@export_range(0, 100, 0.01) var smooth:float = 10
@export var restric: bool = true

@onready var control: Control = %Control

var captured: bool = false
var captured_position: Vector2
var moving: bool = false

var _velocity: float = 0.0;
var _translate: Vector3 = Vector3()
var _rotation: Vector3 = Vector3()
var _tmp_rotation: Vector3 = Vector3()

func reset_rotation(rot: Vector3) -> void:
    rotation = rot
    _rotation = rot
    _tmp_rotation = rot

func _ready() -> void:
    reset_rotation(rotation)

    @warning_ignore(return_value_discarded)
    control.connect("gui_input", gui_input)

func gui_input(event: InputEvent):
    if not current:
        return

    if captured:
        if event is InputEventMouseMotion:
            var dt = sensitivity / 1500
            
            if OS.has_feature("wasm"):
                dt /= 6
            
            _rotation.y -= event.relative.x * dt
            _rotation.x -= event.relative.y * dt
            if restric:
                # 0.01 为了避免万向锁
                _rotation.x = clamp(_rotation.x, PI/-2 + 0.01, PI/2 - 0.01)

    if event is InputEventMouseButton:
        match event.button_index:
            MOUSE_BUTTON_LEFT:
                if event.pressed:
                    Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
                    captured = true
                    captured_position = event.position
                else:
                    Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
                    captured = false
                    control.warp_mouse(captured_position)

            MOUSE_BUTTON_WHEEL_UP: # increase fly velocity
                max_speed *= speed_scale
            MOUSE_BUTTON_WHEEL_DOWN: # decrease fly velocity
                max_speed /= speed_scale

func set_rotation(rot: Vector3):
    rotation = rot

func _process(delta: float) -> void:
    var direction = Vector3(
            float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)),
            float(Input.is_key_pressed(KEY_E)) - float(Input.is_key_pressed(KEY_Q)), 
            float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W))
        ).normalized()


    if captured and direction.length() != 0:
        _velocity += (max_speed - _velocity) * delta * acceleration * sensitivity
        _translate = direction * _velocity * delta
    else:
        _velocity = min_speed;
        _translate -= _translate * clamp(delta * smooth, 0, 1);

    translate(_translate)

    var _rotate := (_rotation - _tmp_rotation) * (clamp(delta * smooth * 1.5, 0.01, 1.0) as float)
    _tmp_rotation += _rotate
    set_rotation(_tmp_rotation)

    const dd := 0.00000001
    moving = _rotate.length_squared() > dd || _translate.length_squared() > dd
    
